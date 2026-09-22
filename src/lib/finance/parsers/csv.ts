import Papa from "papaparse";
import type { Parser, ParseOutput, ParsedTransaction } from "../types";
import { detectAccountType, detectTransactionType, parseAmount, parseDate } from "./shared";

const COLUMN_MAPPINGS: Record<string, string[]> = {
  date: ["date", "transaction date", "posted date", "transactiondate", "posteddate", "dt", "post date", "posting date"],
  description: ["description", "merchant", "payee", "transaction", "details", "memo", "name"],
  debit: ["debit", "withdrawal", "withdrawals", "debit amount"],
  credit: ["credit", "deposit", "deposits", "credit amount"],
  amount: ["amount", "transaction amount", "value"],
  account: ["account", "account number", "bank account", "account #", "account name"],
  status: ["status"],
};

function mapColumns(fields: string[]): Record<string, string> {
  const lower = fields.map((f) => f.trim().toLowerCase());
  const mapped: Record<string, string> = {};
  for (const [std, names] of Object.entries(COLUMN_MAPPINGS)) {
    for (const col of lower) {
      if (names.includes(col) || names.some((n) => col.includes(n))) {
        mapped[std] = fields[lower.indexOf(col)];
        break;
      }
    }
    // Positional fallback (date, description, amount = first three cols)
    if (!mapped[std]) {
      if (std === "date" && fields.length >= 1) mapped[std] = fields[0];
      else if (std === "description" && fields.length >= 2) mapped[std] = fields[1];
      else if (std === "amount" && fields.length >= 3) mapped[std] = fields[2];
    }
  }
  return mapped;
}

function maskAccount(raw: string): string {
  const a = raw.replace(/"/g, "").trim();
  if (!a || a.startsWith("XXXXXX")) return a;
  if (/^\d+$/.test(a)) return `XXXXXX${a.slice(-4).padStart(4, "0")}`;
  if (/^Z\w{4,}$/i.test(a)) return `XXXXXX${a.slice(-4)}`;
  return a;
}

export const csvParser: Parser = {
  canParse: (filename) => filename.toLowerCase().endsWith(".csv"),

  parse(filename, content): ParseOutput {
    const text = content.toString("utf-8");
    const accountType = detectAccountType(text, filename);
    const { data, meta } = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const fields = meta.fields ?? [];
    if (fields.length < 2) throw new Error("CSV has no recognizable header row");
    const cols = mapColumns(fields);

    const transactions: ParsedTransaction[] = [];
    for (const row of data) {
      try {
        let amount = 0;
        if (cols.debit && cols.credit) {
          amount = parseAmount(row[cols.credit]) - parseAmount(row[cols.debit]);
        } else if (cols.amount) {
          amount = parseAmount(row[cols.amount]);
        }
        const date = parseDate(row[cols.date]);
        if (!date) continue;
        const description = (row[cols.description] ?? "").trim();
        if (!description) continue;

        const account = cols.account ? maskAccount(row[cols.account] ?? "") : "";
        const transactionType = detectTransactionType(amount, accountType);
        transactions.push({
          date,
          description,
          amount,
          account: account || filename,
          accountType,
          transactionType,
          status: (cols.status && row[cols.status]) || "Posted",
        });
      } catch {
        continue; // skip malformed rows
      }
    }

    return {
      kind: "transactions",
      transactions,
      positions: [],
      accountType,
      accountHint: transactions[0]?.account,
    };
  },
};
