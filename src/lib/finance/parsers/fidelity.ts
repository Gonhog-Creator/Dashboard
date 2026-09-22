import Papa from "papaparse";
import type { Parser, ParseOutput, ParsedTransaction } from "../types";
import { parseAmount, parseDate } from "./shared";

/** Port of BudgetTool fidelity_parser.py — Fidelity activity CSV exports. */

const COLUMN_MAPPINGS: Record<string, string[]> = {
  date: ["date", "transaction date", "settlement date", "trade date", "run date"],
  description: ["description", "action", "activity", "transaction description"],
  symbol: ["symbol", "ticker", "security"],
  quantity: ["quantity", "shares", "units"],
  price: ["price ($)", "price", "unit price", "cost per share"],
  amount: ["amount ($)", "amount", "total", "proceeds", "cost", "value"],
  commission: ["commission ($)", "commission", "fee", "fees"],
  action: ["action", "activity", "transaction type", "type"],
  account: ["account", "account name", "account number"],
};

const INVESTMENT_ACTIONS: Record<string, string[]> = {
  buy: ["buy", "bought", "purchase"],
  sell: ["sell", "sold", "sale"],
  dividend: ["dividend", "div", "reinvest dividend", "reinvest div"],
  reinvest: ["reinvest", "reinvestment", "div reinvest"],
  deposit: ["deposit", "contribution", "funding"],
  withdrawal: ["withdrawal", "distribution", "payout"],
  transfer: ["transfer in", "transfer out", "journal"],
};

const TX_INDICATORS = ["action", "run date", "settlement date", "commission ($)", "fees ($)", "amount ($)"];
const ACTION_PATTERNS = ["you bought", "you sold", "transfer", "dividend", "reinvest"];

function mapColumns(fields: string[]): Record<string, string> {
  const lower = fields.map((f) => f.trim().toLowerCase());
  const mapped: Record<string, string> = {};
  for (const [std, names] of Object.entries(COLUMN_MAPPINGS)) {
    for (let i = 0; i < lower.length; i++) {
      if (names.includes(lower[i]) || names.some((n) => lower[i].includes(n))) {
        mapped[std] = fields[i];
        break;
      }
    }
  }
  return mapped;
}

function detectType(action: string, description: string): string {
  const combined = `${action} ${description}`.toLowerCase();
  for (const [type, keywords] of Object.entries(INVESTMENT_ACTIONS)) {
    if (keywords.some((k) => combined.includes(k))) return type;
  }
  return "buy";
}

export const fidelityParser: Parser = {
  canParse(filename, content) {
    if (!filename.toLowerCase().endsWith(".csv")) return false;
    const s = content.toString("utf-8").toLowerCase();
    return (
      TX_INDICATORS.some((i) => s.includes(i)) ||
      ACTION_PATTERNS.some((p) => s.includes(p))
    );
  },

  parse(filename, content): ParseOutput {
    const { data, meta } = Papa.parse<Record<string, string>>(content.toString("utf-8"), {
      header: true,
      skipEmptyLines: true,
    });
    const cols = mapColumns(meta.fields ?? []);

    const transactions: ParsedTransaction[] = [];
    for (const row of data) {
      try {
        const action = (cols.action ? row[cols.action] : "") ?? "";
        let description = (cols.description ? row[cols.description] : "") ?? "";
        const type = detectType(action, description);
        let amount = parseAmount(cols.amount ? row[cols.amount] : 0);
        if (type === "buy" || type === "withdrawal") amount = -Math.abs(amount);
        else if (["sell", "dividend", "deposit"].includes(type)) amount = Math.abs(amount);

        const symbol = (cols.symbol ? row[cols.symbol] : "") ?? "";
        if (!description || /no description/i.test(description)) description = action;
        if (symbol) description = `${symbol} - ${description}`;

        const date = parseDate(cols.date ? row[cols.date] : null);
        if (!date) continue;

        transactions.push({
          date,
          description: description.trim() || "Fidelity transaction",
          amount,
          account: (cols.account ? row[cols.account] : "") || "Fidelity Investment Account",
          accountType: "investment",
          transactionType: type,
          status: "Posted",
          symbol: symbol || undefined,
          quantity: cols.quantity ? parseAmount(row[cols.quantity]) : undefined,
          price: cols.price ? parseAmount(row[cols.price]) : undefined,
        });
      } catch {
        continue;
      }
    }

    return {
      kind: "transactions",
      transactions,
      positions: [],
      institutionHint: "Fidelity",
      accountType: "investment",
      accountHint: transactions[0]?.account,
    };
  },
};
