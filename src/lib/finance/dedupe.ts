import { createHash } from "crypto";

/** Lowercase alnum-only — digits kept so distinct refs stay distinct. */
export function normalizeForHash(desc: string): string {
  return desc.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Digit-stripped grouping key for recurring detection / similarity sort. */
export function normalizeForGroup(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d+/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeHash(
  accountId: string,
  date: Date,
  amount: number,
  description: string
): string {
  const d = date.toISOString().slice(0, 10);
  return createHash("sha1")
    .update(`${accountId}|${d}|${amount.toFixed(2)}|${normalizeForHash(description)}`)
    .digest("hex");
}
