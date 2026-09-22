import { prisma, ensureWal } from "@/lib/db";
import { parseStatement } from "./parsers";
import { categorizeBatch } from "./categorize";
import { dedupeHash } from "./dedupe";
import type { ParsedPosition, ParsedTransaction } from "./types";

const PORTALS: Record<string, string> = {
  "first citizens": "https://www.firstcitizens.com",
  fidelity: "https://www.fidelity.com",
  coinbase: "https://www.coinbase.com",
};

function institutionType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("fidelity")) return "brokerage";
  if (n.includes("coinbase")) return "crypto";
  if (n.includes("manual")) return "manual";
  return "bank";
}

export async function findOrCreateInstitution(name: string) {
  const portal = Object.entries(PORTALS).find(([k]) =>
    name.toLowerCase().includes(k)
  )?.[1];
  const existing = await prisma.finInstitution.findFirst({
    where: { name: { equals: name } },
  });
  if (existing) return existing;
  return prisma.finInstitution.create({
    data: { name, type: institutionType(name), portalUrl: portal ?? null },
  });
}

async function findOrCreateAccount(opts: {
  institutionId: string;
  name: string;
  mask?: string | null;
  type: string;
}) {
  const { institutionId, name, mask, type } = opts;
  // Prefer mask match, then name match within the institution.
  if (mask) {
    const byMask = await prisma.finAccount.findFirst({
      where: { institutionId, mask },
    });
    if (byMask) return byMask;
  }
  const byName = await prisma.finAccount.findFirst({
    where: { institutionId, name },
  });
  if (byName) return byName;
  return prisma.finAccount.create({
    data: { institutionId, name, mask: mask ?? null, type },
  });
}

export interface ImportResult {
  importId: string;
  filename: string;
  kind: "transactions" | "positions";
  inserted: number;
  skipped: number;
  accountId: string;
  accountName: string;
}

/**
 * Parse a statement file, resolve/create the account, dedupe, categorize, insert.
 * `accountId` (optional) forces all rows into an existing account.
 */
export async function importStatement(
  filename: string,
  content: Buffer,
  accountId?: string
): Promise<ImportResult> {
  await ensureWal();
  const parsed = await parseStatement(filename, content);
  const source = filename.toLowerCase().endsWith(".ofx") ||
    filename.toLowerCase().endsWith(".qfx") ||
    filename.toLowerCase().endsWith(".qbo")
    ? "ofx"
    : filename.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : "csv";

  const institution = await findOrCreateInstitution(
    parsed.institutionHint ?? "Manual"
  );

  // ---- Positions path ----
  if (parsed.kind === "positions") {
    const account = accountId
      ? await prisma.finAccount.findUniqueOrThrow({ where: { id: accountId } })
      : await findOrCreateAccount({
          institutionId: institution.id,
          name: parsed.accountHint ?? "Investment Account",
          type: "investment",
        });
    const inserted = await insertPositions(account.id, parsed.positions, source);
    const imp = await prisma.finImport.create({
      data: {
        filename,
        fileType: "position",
        accountId: account.id,
        rowCount: inserted,
      },
    });
    return {
      importId: imp.id,
      filename,
      kind: "positions",
      inserted,
      skipped: 0,
      accountId: account.id,
      accountName: account.name,
    };
  }

  // ---- Snapshots (statement-ending balances, e.g. Fidelity reports) ----
  if (parsed.snapshots?.length) {
    for (const s of parsed.snapshots) {
      const mask = s.accountHint.match(/(\d{4})$/)?.[1] ?? null;
      const account = await findOrCreateAccount({
        institutionId: institution.id,
        name: s.accountHint,
        mask,
        type: parsed.accountType ?? "investment",
      });
      const date = s.date.toISOString().slice(0, 10);
      await prisma.finBalanceSnapshot.upsert({
        where: { accountId_date: { accountId: account.id, date } },
        create: { accountId: account.id, date, balance: s.balance },
        update: { balance: s.balance },
      });
    }
  }

  // ---- Transactions path ----
  if (parsed.transactions.length === 0) {
    if (parsed.snapshots?.length) {
      return {
        importId: "",
        filename,
        kind: "transactions",
        inserted: 0,
        skipped: 0,
        accountId: "",
        accountName: "",
      };
    }
    throw new Error("No transactions found in file");
  }

  // Group by account hint so multi-account files split correctly.
  const byAccount = new Map<string, ParsedTransaction[]>();
  for (const tx of parsed.transactions) {
    const key = tx.account ?? parsed.accountHint ?? "Imported Account";
    const g = byAccount.get(key) ?? [];
    g.push(tx);
    byAccount.set(key, g);
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let primaryAccountId = accountId ?? "";
  let primaryAccountName = "";

  for (const [hint, txs] of byAccount) {
    const mask = hint.match(/(\d{4})$/)?.[1] ?? null;
    const account = accountId
      ? await prisma.finAccount.findUniqueOrThrow({ where: { id: accountId } })
      : await findOrCreateAccount({
          institutionId: institution.id,
          name: hint === filename ? "Imported Account" : hint,
          mask,
          type: parsed.accountType ?? txs[0]?.accountType ?? "checking",
        });
    if (!primaryAccountId) {
      primaryAccountId = account.id;
      primaryAccountName = account.name;
    }

    const categorized = await categorizeBatch(txs);
    const rows = categorized.map((tx) => ({
      accountId: account.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      categoryId: tx.categoryId,
      transactionType: tx.transactionType ?? null,
      status: (tx.status ?? "posted").toLowerCase(),
      source,
      dedupeHash: dedupeHash(account.id, tx.date, tx.amount, tx.description),
    }));

    // Dedupe against existing hashes for this account.
    const hashes = rows.map((r) => r.dedupeHash!);
    const existing = await prisma.finTransaction.findMany({
      where: { dedupeHash: { in: hashes } },
      select: { dedupeHash: true },
    });
    const existingSet = new Set(existing.map((e) => e.dedupeHash));
    let fresh = rows.filter((r) => !existingSet.has(r.dedupeHash));

    // Cross-source dedupe: statement descriptions differ from Plaid's, so the
    // hash misses. Same account+amount within ±3 days from a different source
    // = dupe (posting dates drift). Greedy consume so N identical rows only
    // cancel N existing ones.
    if (fresh.length > 0) {
      const dates = fresh.map((r) => r.date.getTime());
      const lo = new Date(Math.min(...dates) - 3 * 86400000);
      const hi = new Date(Math.max(...dates) + 4 * 86400000);
      const others = await prisma.finTransaction.findMany({
        where: {
          accountId: account.id,
          date: { gte: lo, lt: hi },
          source: { not: source },
        },
        select: { date: true, amount: true },
      });
      const used = new Set<number>();
      fresh = fresh.filter((r) => {
        const t = r.date.getTime();
        const idx = others.findIndex(
          (o, i) =>
            !used.has(i) &&
            o.amount === r.amount &&
            Math.abs(o.date.getTime() - t) <= 3 * 86400000
        );
        if (idx < 0) return true;
        used.add(idx);
        return false;
      });
    }
    const seenInFile = new Set<string>();
    const unique = fresh.filter((r) => {
      if (seenInFile.has(r.dedupeHash!)) return false;
      seenInFile.add(r.dedupeHash!);
      return true;
    });

    const imp = await prisma.finImport.create({
      data: {
        filename,
        fileType: "transaction",
        accountId: account.id,
        rowCount: unique.length,
        skipped: rows.length - unique.length,
      },
    });
    await prisma.finTransaction.createMany({
      data: unique.map((r) => ({ ...r, importId: imp.id })),
    });
    totalInserted += unique.length;
    totalSkipped += rows.length - unique.length;
  }

  return {
    importId: "",
    filename,
    kind: "transactions",
    inserted: totalInserted,
    skipped: totalSkipped,
    accountId: primaryAccountId,
    accountName: primaryAccountName,
  };
}

async function insertPositions(
  accountId: string,
  positions: ParsedPosition[],
  source: string
): Promise<number> {
  if (positions.length === 0) return 0;
  const asOf = positions[0].asOf;
  // Replace holdings for that statement date (re-imports are idempotent).
  await prisma.finHolding.deleteMany({ where: { accountId, asOf } });
  await prisma.finHolding.createMany({
    data: positions.map((p) => ({
      accountId,
      symbol: p.symbol ?? null,
      description: p.description ?? null,
      quantity: p.quantity ?? null,
      price: p.price ?? null,
      value: p.value ?? null,
      costBasis: p.costBasis ?? null,
      asOf: p.asOf,
      source,
    })),
  });
  // Update the account's current balance if this is the newest statement.
  const total = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  const latest = await prisma.finHolding.findFirst({
    where: { accountId },
    orderBy: { asOf: "desc" },
    select: { asOf: true },
  });
  if (latest && latest.asOf.getTime() === asOf.getTime() && total > 0) {
    await prisma.finAccount.update({
      where: { id: accountId },
      data: { currentBalance: total, balanceUpdatedAt: new Date() },
    });
  }
  return positions.length;
}
