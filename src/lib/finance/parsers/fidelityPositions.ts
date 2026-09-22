import Papa from "papaparse";
import type { Parser, ParseOutput, ParsedPosition } from "../types";

/** Port of BudgetTool fidelity_position_parser.py — holdings CSV exports. */

const POSITION_INDICATORS = ["symbol/cusip", "beginning value", "ending value", "cost basis", "current value"];
const TX_INDICATORS = ["action", "run date", "settlement date", "commission ($)", "fees ($)"];

/** Statement1312025.csv → Jan 31 2025; 9302025 → Sep 30 2025. */
function dateFromFilename(filename: string): Date {
  let name = filename.replace(/\.csv$/i, "").replace(/Statement/i, "").trim();
  name = name.replace(/\s*\(\d+\)$/, "").trim();
  const ym = name.match(/(\d{2,4})$/);
  if (!ym) return new Date();
  let year = parseInt(ym[1], 10);
  if (year < 100) year += year >= 23 ? 2000 : 1900;
  const rem = name.slice(0, name.length - ym[1].length);
  let month: number, day: number;
  if (rem.length === 3) {
    month = parseInt(rem[0], 10);
    day = parseInt(rem.slice(1), 10);
  } else if (rem.length === 4) {
    month = parseInt(rem.slice(0, 2), 10);
    day = parseInt(rem.slice(2), 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      month = parseInt(rem[0], 10);
      day = parseInt(rem.slice(1), 10);
    }
  } else {
    return new Date();
  }
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const s = v.trim().toLowerCase();
  if (["unavailable", "not applicable", "n/a", ""].includes(s)) return undefined;
  const n = parseFloat(s.replace(/,/g, "").replace(/\$/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

function extractAccountInfo(text: string, filename: string) {
  let accountName: string | undefined;
  let accountNumber: string | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if ((/portfolio|ira/i.test(line)) && !/^account/i.test(line) && line.length < 50) {
      accountName ??= line;
    }
    if (/^Z\d{8}$/.test(line)) accountNumber = `XXXXXX${line.slice(-4)}`;
  }
  if (!accountName) {
    const f = filename.toLowerCase();
    accountName = f.includes("options")
      ? "Options Portfolio"
      : f.includes("roth") || f.includes("ira")
        ? "ROTH IRA"
        : f.includes("stocks")
          ? "Stocks Portfolio"
          : "Investment Account";
  }
  return { accountName, accountNumber };
}

export const fidelityPositionParser: Parser = {
  canParse(filename, content) {
    if (!filename.toLowerCase().endsWith(".csv")) return false;
    const s = content.toString("utf-8").toLowerCase();
    return (
      POSITION_INDICATORS.some((i) => s.includes(i)) &&
      !TX_INDICATORS.some((i) => s.includes(i))
    );
  },

  parse(filename, content): ParseOutput {
    const text = content.toString("utf-8");
    const asOf = dateFromFilename(filename);
    const { accountName, accountNumber } = extractAccountInfo(text, filename);

    // header:false → array rows, mirroring the pandas row-scan approach
    const { data } = Papa.parse<string[]>(text, { skipEmptyLines: true });

    let headerIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if ((data[i][0] ?? "").toLowerCase().includes("symbol/cusip")) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) throw new Error("Could not find holdings section in CSV");

    const headers = data[headerIdx].map((h) => (h ?? "").trim().toLowerCase());
    const col: Record<string, number> = {};
    headers.forEach((h, i) => {
      if (h.includes("symbol") && h.includes("cusip")) col.symbol = i;
      else if (h.includes("description")) col.description = i;
      else if (h.includes("quantity")) col.quantity = i;
      else if (h.includes("price")) col.price = i;
      else if (h.includes("beginning value")) col.beginning = i;
      else if (h.includes("ending value") || h.includes("current value")) col.ending = i;
      else if (h.includes("cost basis")) col.costBasis = i;
    });

    const positions: ParsedPosition[] = [];
    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      const first = (row[0] ?? "").trim();
      if (!first) continue;
      if (/subtotal/i.test(first)) continue;
      if (/^Z\d{8}$/.test(first)) continue;
      if (/core account|stocks/i.test(first)) continue;

      const symbol = col.symbol != null ? row[col.symbol]?.trim() : undefined;
      const description = col.description != null ? row[col.description]?.trim() : undefined;
      if (!symbol && !description) continue;

      positions.push({
        symbol: symbol || undefined,
        description: description || undefined,
        quantity: num(col.quantity != null ? row[col.quantity] : undefined),
        price: num(col.price != null ? row[col.price] : undefined),
        value: num(col.ending != null ? row[col.ending] : undefined),
        costBasis: num(col.costBasis != null ? row[col.costBasis] : undefined),
        account: accountName,
        accountNumber,
        asOf,
      });
    }

    return {
      kind: "positions",
      transactions: [],
      positions,
      institutionHint: "Fidelity",
      accountType: "investment",
      accountHint: accountName,
    };
  },
};
