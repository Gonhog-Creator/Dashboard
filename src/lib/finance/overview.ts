import { prisma, ensureWal } from "@/lib/db";
import { monthKey } from "./format";
import { excludeHidden } from "./exclusions";
import { netWorthSeries as buildNetWorthSeries } from "./history";

const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

function monthStart(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

type TxLike = {
  amount: number;
  transactionType: string | null;
  category: { name: string; isIncome: boolean } | null;
  account?: { type: string } | null;
};

/** Transfers/payments — Plaid types are UPPER_SNAKE, file imports lowercase. */
const isTransferLike = (t: TxLike) => {
  const ty = (t.transactionType ?? "").toLowerCase();
  return (
    ty.startsWith("transfer") ||
    ty === "payment" ||
    ty.startsWith("loan_payments") ||
    t.category?.name === "Transfer"
  );
};

const isSpend = (t: TxLike) =>
  t.amount < 0 && !isTransferLike(t) && !t.category?.isIncome;

const isIncome = (t: TxLike) =>
  t.amount > 0 &&
  // Positive amounts on credit cards/loans are payments/refunds, never income.
  !LIABILITY_TYPES.has(t.account?.type ?? "") &&
  // An explicit Income category wins over a TRANSFER_* type (e.g. recurring
  // inflows from an unlinked account that the user marks as income).
  (t.category?.isIncome === true || !isTransferLike(t));

export async function getFinanceOverview() {
  await ensureWal();
  const now = new Date();
  const m0 = monthStart(0);
  const m1 = monthStart(1);
  const mPrev = monthStart(-1);
  const m3ago = monthStart(-3);

  const [accounts, monthTxs, prevTxs, quarterTxs, netWorthSeries, recurring] =
    await Promise.all([
      prisma.finAccount.findMany({
        where: { isActive: true },
        include: { institution: { select: { name: true } } },
      }),
      prisma.finTransaction.findMany({
        where: excludeHidden({ date: { gte: m0, lt: m1 }, status: "posted" }),
        include: {
          category: { select: { name: true, color: true, isIncome: true } },
          account: { select: { type: true } },
        },
      }),
      prisma.finTransaction.findMany({
        where: excludeHidden({ date: { gte: mPrev, lt: m0 }, status: "posted" }),
        select: {
          amount: true,
          transactionType: true,
          category: { select: { name: true, isIncome: true } },
          account: { select: { type: true } },
        },
      }),
      prisma.finTransaction.findMany({
        where: excludeHidden({ date: { gte: m3ago, lt: m0 }, status: "posted" }),
        select: {
          amount: true,
          transactionType: true,
          category: { select: { name: true, isIncome: true } },
          account: { select: { type: true } },
        },
      }),
      buildNetWorthSeries(),
      prisma.finRecurringStream.findMany({
        where: { isActive: true },
        orderBy: { nextExpected: "asc" },
      }),
    ]);

  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    const bal = a.currentBalance ?? 0;
    if (LIABILITY_TYPES.has(a.type)) liabilities += bal;
    else assets += bal;
  }
  const netWorth = assets - liabilities;

  const monthSpend = -monthTxs.filter(isSpend).reduce((s, t) => s + t.amount, 0);
  const monthIncome = monthTxs.filter(isIncome).reduce((s, t) => s + t.amount, 0);
  const prevSpend = -prevTxs.filter(isSpend).reduce((s, t) => s + t.amount, 0);
  const prevIncome = prevTxs.filter(isIncome).reduce((s, t) => s + t.amount, 0);
  const avgSpend3m =
    -quarterTxs.filter(isSpend).reduce((s, t) => s + t.amount, 0) / 3;
  const savingsRate =
    monthIncome > 0 ? (monthIncome - monthSpend) / monthIncome : null;
  const prevSavingsRate =
    prevIncome > 0 ? (prevIncome - prevSpend) / prevIncome : null;

  const catMap = new Map<string, { name: string; color: string; total: number }>();
  const merchMap = new Map<string, number>();
  for (const t of monthTxs) {
    if (!isSpend(t)) continue;
    const key = t.category?.name ?? "Uncategorized";
    const cur = catMap.get(key) ?? {
      name: key,
      color: t.category?.color ?? "#64748b",
      total: 0,
    };
    cur.total += -t.amount;
    catMap.set(key, cur);
    const merch = t.merchantName ?? t.description;
    merchMap.set(merch, (merchMap.get(merch) ?? 0) + -t.amount);
  }
  const categories = [...catMap.values()].sort((a, b) => b.total - a.total);
  const topMerchants = [...merchMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, total]) => ({ name, total }));

  const verdicts: string[] = [];
  if (avgSpend3m > 0) {
    const pct = ((monthSpend - avgSpend3m) / avgSpend3m) * 100;
    if (Math.abs(pct) >= 10) {
      verdicts.push(
        `Spending is ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(0)}% vs your 3-month average`
      );
    }
  }
  if (savingsRate != null) {
    verdicts.push(
      savingsRate >= 0.2
        ? `Savings rate ${(savingsRate * 100).toFixed(0)}% — on track`
        : `Savings rate ${(savingsRate * 100).toFixed(0)}% — below the 20% guideline`
    );
  }
  const uncategorized = monthTxs.filter((t) => !t.categoryId).length;
  if (uncategorized > 0) {
    verdicts.push(`${uncategorized} uncategorized transactions this month`);
  }

  return {
    netWorth,
    assets,
    liabilities,
    monthSpend,
    monthIncome,
    prevSpend,
    prevIncome,
    avgSpend3m,
    savingsRate,
    prevSavingsRate,
    categories,
    topMerchants,
    netWorthSeries,
    recurring: recurring.slice(0, 10).map((r) => ({
      ...r,
      nextExpected: r.nextExpected?.toISOString() ?? null,
      lastSeen: r.lastSeen?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    recurringMonthly: recurring
      .filter((r) => r.frequency === "monthly" && r.amount)
      .reduce((s, r) => s + (r.amount ?? 0), 0),
    verdicts,
    accountCount: accounts.length,
    month: monthKey(now),
    fetchedAt: now.toISOString(),
  };
}
