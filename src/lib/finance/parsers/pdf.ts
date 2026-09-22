import { extractText, getDocumentProxy } from "unpdf";
import type { ParseOutput, ParsedTransaction } from "../types";
import { detectAccountType, detectTransactionType, parseAmount } from "./shared";

/** PDF statement parsers — First Citizens card + deposit, Fidelity reports.
 *  FC deposit statements scramble column order in plain text extraction, so
 *  those are parsed from positional rows (x/y coordinates). */

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function monthDate(s: string): Date | null {
  const m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (mo == null) return null;
  return new Date(+m[3], mo, +m[2]);
}

// ---------- positional row extraction ----------

interface PdfRow {
  y: number;
  items: { x: number; s: string }[];
}

async function extractRows(content: Buffer): Promise<PdfRow[]> {
  const pdf = await getDocumentProxy(new Uint8Array(content));
  const rows: PdfRow[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const key = [...byY.keys()].find((k) => Math.abs(k - y) < 3) ?? y;
      const arr = byY.get(key) ?? [];
      arr.push({ x: it.transform[4], s: it.str });
      byY.set(key, arr);
    }
    for (const [y, items] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      rows.push({ y, items: items.sort((a, b) => a.x - b.x) });
    }
  }
  return rows;
}

const MONEY_RE = /^-?[\d,]+\.\d{2}$/;

// ---------- First Citizens credit card ----------
// Line format: "01/02 01/02 7411870QL00XTMJG0 ELECTRONIC PMT-THANK YOU 34.60-"
// Trailing "-" = credit to the card (payment/refund) -> positive amount.
// Fee rows have no reference number. Year inferred from Statement Closing Date.

const CARD_TX_RE =
  /^(\d{2})\/(\d{2})\s+\d{2}\/\d{2}\s+(?:[A-Z0-9]{10,}\s+)?(.+?)\s+([\d,]+\.\d{2})(-?)$/;

function parseFcCard(text: string): ParsedTransaction[] {
  const closing = text.match(/Statement Closing Date\s+(\d{2})\/(\d{2})\/(\d{2})/);
  if (!closing) return [];
  const closeYear = 2000 + +closing[3];
  const closeMonth = +closing[1];

  const out: ParsedTransaction[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const m = line.match(CARD_TX_RE);
    if (!m) continue;
    const txMonth = +m[1];
    // Dec transactions on a Jan statement belong to the prior year.
    const year = txMonth > closeMonth ? closeYear - 1 : closeYear;
    const date = new Date(year, txMonth - 1, +m[2]);
    const amt = parseAmount(m[4]);
    const amount = m[5] === "-" ? amt : -amt;
    out.push({
      date,
      description: m[3].trim(),
      amount,
      account: "Rewards Visa Signature",
      accountType: "credit_card",
      transactionType: detectTransactionType(amount, "credit_card"),
      status: "Posted",
    });
  }
  return out;
}

// ---------- First Citizens deposit (Together Card / savings) ----------
// Positional rows: [x~37]MM-DD  [x~79+]description…  [x~500+]amount
// Sections: "…Credits To Your Account" (+) / "…Debits From Your Account" (-).
// MM-DD year inferred from "Statement Period: <start> Thru <end>".

function parseFcDeposit(rows: PdfRow[], text: string): ParsedTransaction[] {
  const period = text.match(
    /Statement Period:\s*([A-Za-z]+ \d+, \d{4})\s*Thru\s*([A-Za-z]+ \d+, \d{4})/
  );
  if (!period) return [];
  const start = monthDate(period[1]);
  const end = monthDate(period[2]);
  if (!start || !end) return [];

  const acctNum = text.match(/Account Number\s*:\s*(\d{6,})/)?.[1];
  const mask = acctNum?.slice(-4);
  const acctName = /together card/i.test(text)
    ? "Together Card"
    : /savings/i.test(text)
      ? "Savings"
      : "Checking";
  const hint = mask ? `${acctName} ${mask}` : acctName;

  const out: ParsedTransaction[] = [];
  let sign: 1 | -1 | null = null;
  for (const row of rows) {
    const joined = row.items.map((i) => i.s).join(" ").trim();
    if (/(credits?|deposits?) to your account/i.test(joined) || /^deposits$/i.test(joined)) {
      sign = 1;
      continue;
    }
    if (/debits? from your account/i.test(joined) || /^checks$/i.test(joined)) {
      sign = -1;
      continue;
    }
    if (/^(total|daily balance|ending balance|beginning balance)/i.test(joined)) {
      sign = null;
      continue;
    }
    if (/^date\b/i.test(joined)) continue; // column header row — keep section
    if (sign == null) continue;
    const first = row.items[0];
    const dm = first?.s.match(/^(\d{2})-(\d{2})$/);
    if (!dm) continue;
    const last = row.items[row.items.length - 1];
    if (!last || !MONEY_RE.test(last.s.trim())) continue;
    const txMonth = +dm[1];
    const year = txMonth === end.getMonth() + 1 ? end.getFullYear() : start.getFullYear();
    const date = new Date(year, txMonth - 1, +dm[2]);
    const amount = sign * parseAmount(last.s);
    const description = row.items.slice(1, -1).map((i) => i.s).join(" ").trim();
    if (!description) continue;
    out.push({
      date,
      description,
      amount,
      account: hint,
      accountType: "checking",
      transactionType: detectTransactionType(amount, "checking"),
      status: "Posted",
    });
  }
  return out;
}

// ---------- Fidelity investment report ----------
// Monthly "Ending Account Value" -> balance snapshot (net worth history).

function parseFidelity(text: string): NonNullable<ParseOutput["snapshots"]> {
  // Period end: "INVESTMENT REPORT <start> - <end>" or year-end "as of <date>".
  const periodEnd =
    monthDate(
      text.match(
        /INVESTMENT REPORT[^\n]*\n?\s*[A-Za-z]+ \d+, \d{4}\s*-\s*([A-Za-z]+ \d+, \d{4})/
      )?.[1] ?? ""
    ) ??
    monthDate(
      text.match(/Ending (?:Net )?Account Value as of ([A-Za-z]+ \d+, \d{4})/)?.[1] ?? ""
    );
  if (!periodEnd) return [];

  // Per-account sections: "Account Number: Z33-184097" or "Account # 264-507316",
  // each followed by its own "Ending Account Value ... $X". First occurrence of
  // each mask owns the section that follows it.
  const out: NonNullable<ParseOutput["snapshots"]> = [];
  const seen = new Set<string>();
  const acctRe = /Account (?:Number:|#)\s*Z?\d+-(\d{4,})/g;
  let m: RegExpExecArray | null;
  while ((m = acctRe.exec(text))) {
    const mask = m[1].slice(-4);
    if (seen.has(mask)) continue;
    const v = text
      .slice(m.index)
      .match(/Ending (?:Net )?Account Value[^\n$]*\$([\d,]+\.\d{2})/);
    if (!v) continue;
    seen.add(mask);
    out.push({
      accountHint: `Fidelity ${mask}`,
      date: periodEnd,
      balance: parseAmount(v[1]),
    });
  }
  return out;
}

// ---------- generic fallback ----------

const DATE_RE = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/;
const AMOUNT_RE = /-?\$?\d{1,3}(?:,?\d{3})*\.\d{2}/;

function parseGeneric(text: string, accountType: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || /balance|total/i.test(t)) continue;
    const dm = t.match(DATE_RE);
    const am = t.match(AMOUNT_RE);
    if (!dm || !am) continue;
    const date = new Date(dm[0]);
    if (Number.isNaN(date.getTime())) continue;
    let amount = parseAmount(am[0]);
    if (am[0].includes("-") || /CR/.test(t.toUpperCase())) amount = -Math.abs(amount);
    const description = t.replace(DATE_RE, "").replace(AMOUNT_RE, "").trim();
    if (!description) continue;
    out.push({
      date,
      description,
      amount,
      account: "PDF Statement",
      accountType,
      transactionType: detectTransactionType(amount, accountType),
      status: "Posted",
    });
  }
  return out;
}

// ---------- entry ----------

export async function parsePdf(filename: string, content: Buffer): Promise<ParseOutput> {
  const accountType = detectAccountType("", filename);
  const { text } = await extractText(new Uint8Array(content), { mergePages: true });
  const full = Array.isArray(text) ? text.join("\n") : String(text ?? "");

  // Fidelity investment report -> balance snapshots, no transactions.
  if (/INVESTMENT REPORT/i.test(full) && /fidelity/i.test(full)) {
    return {
      kind: "transactions",
      transactions: [],
      positions: [],
      snapshots: parseFidelity(full),
      institutionHint: "Fidelity",
      accountType: "investment",
    };
  }

  // First Citizens card statement.
  if (
    /statement closing date/i.test(full) &&
    /credit limit/i.test(full) &&
    !/statement period:/i.test(full)
  ) {
    return {
      kind: "transactions",
      transactions: parseFcCard(full),
      positions: [],
      institutionHint: "First Citizens Bank",
      accountType: "credit_card",
    };
  }

  // First Citizens deposit statement — header may read "Central Bank
  // Operations", so detect by the Statement Period structure, not the name.
  if (/statement period:\s*[A-Za-z]+ \d+, \d{4}\s*thru/i.test(full)) {
    return {
      kind: "transactions",
      transactions: parseFcDeposit(await extractRows(content), full),
      positions: [],
      institutionHint: "First Citizens Bank",
      accountType: "checking",
    };
  }

  return {
    kind: "transactions",
    transactions: parseGeneric(full, accountType),
    positions: [],
    institutionHint: undefined,
    accountType,
  };
}
