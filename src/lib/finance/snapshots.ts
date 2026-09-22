import { prisma, ensureWal } from "@/lib/db";

/** Daily balance snapshot — powers net-worth & investment-growth charts. */
export async function snapshotBalances(): Promise<string> {
  await ensureWal();
  const today = new Date().toISOString().slice(0, 10);
  const accounts = await prisma.finAccount.findMany({
    where: { isActive: true, currentBalance: { not: null } },
    select: { id: true, currentBalance: true },
  });
  let written = 0;
  for (const a of accounts) {
    await prisma.finBalanceSnapshot.upsert({
      where: { accountId_date: { accountId: a.id, date: today } },
      update: { balance: a.currentBalance! },
      create: { accountId: a.id, date: today, balance: a.currentBalance! },
    });
    written++;
  }
  return `snapshotted ${written} account balances`;
}
