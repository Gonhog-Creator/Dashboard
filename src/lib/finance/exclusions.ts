/**
 * Hardcoded transaction exclusions — hidden from ALL analytics, lists,
 * recurring detection, and net-worth reconstruction.
 *
 * 2025-07-09 +$30,000 / 2025-07-18 -$30,000 "Transfer Internet" on Together
 * Card: a pass-through in-and-out (money was never actually received).
 */
export const HIDDEN_TX_IDS: string[] = [
  "cmuadmkep00c9ur6ku0rsuyjs", // 2025-07-09 +30000
  "cmuadmksa00d7ur6k7ngocf5k", // 2025-07-18 -30000
];

/** Spread into a Prisma FinTransactionWhereInput to skip hidden rows. */
export function excludeHidden<T extends object>(where: T): T & {
  id: { notIn: string[] };
} {
  return { ...where, id: { notIn: HIDDEN_TX_IDS } };
}
