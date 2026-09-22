/** Shared helpers ported from BudgetTool base_parser.py */

const CC_KEYWORDS = [
  "credit card", "visa", "mastercard", "american express", "amex",
  "discover", "payment due", "minimum payment", "credit limit",
  "available credit", "statement balance", "new balance",
  "previous balance", "interest charge", "finance charge",
];

export function detectAccountType(contentStr: string, filename: string): string {
  const hay = (contentStr + " " + filename).toLowerCase();
  for (const kw of CC_KEYWORDS) if (hay.includes(kw)) return "credit_card";
  if (/invest|brokerage|ira|401k|portfolio/.test(hay)) return "investment";
  if (/savings/.test(hay)) return "savings";
  return "checking";
}

export function detectTransactionType(amount: number, accountType: string): string | undefined {
  if (accountType === "credit_card") {
    if (amount < 0) return "purchase";
    if (amount > 0) return "payment";
  } else {
    if (amount < 0) return "withdrawal";
    if (amount > 0) return "deposit";
  }
  return undefined;
}

export function parseAmount(value: unknown): number {
  if (value == null) return 0;
  const n = parseFloat(
    String(value).replace(/,/g, "").replace(/\$/g, "").replace(/\((.+)\)/, "-$1").trim()
  );
  return Number.isNaN(n) ? 0 : n;
}

const DATE_FORMATS: RegExp[] = [
  /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, // M/D/YYYY
  /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, // M/D/YY
  /^(\d{1,2})-(\d{1,2})-(\d{4})/, // M-D-YYYY
];

export function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(DATE_FORMATS[0]);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  for (const re of DATE_FORMATS.slice(1)) {
    m = s.match(re);
    if (m) {
      let year = +m[3];
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      return new Date(year, +m[1] - 1, +m[2]);
    }
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
