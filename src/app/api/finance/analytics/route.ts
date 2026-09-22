import { prisma, ensureWal } from "@/lib/db";
import { monthKey, weekKey } from "@/lib/finance/format";
import {
  historyDays,
  investmentSeries,
  latestHoldings,
  priceSeries,
} from "@/lib/finance/history";
import { excludeHidden } from "@/lib/finance/exclusions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

/** Plaid types are UPPER_SNAKE (TRANSFER_IN), file imports lowercase. */
function isTransferLike(t: {
  transactionType: string | null;
  category?: { name: string } | null;
}): boolean {
  const ty = (t.transactionType ?? "").toLowerCase();
  return (
    ty.startsWith("transfer") ||
    ty === "payment" ||
    ty.startsWith("loan_payments") ||
    t.category?.name === "Transfer"
  );
}

/**
 * GET /api/finance/analytics?view=spending|cashflow|explorer|investments
 *   explorer params: q (keyword), categoryId, accountId, granularity=month|year
 */
export async function GET(request: Request) {
  await ensureWal();
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "spending";

  if (view === "position") {
    const symbol = url.searchParams.get("symbol") ?? "";
    const isCrypto = url.searchParams.get("crypto") === "1";
    if (!symbol) return Response.json({ series: [] });
    const m = await priceSeries(symbol, isCrypto);
    return Response.json({
      series: [...m.entries()].map(([date, price]) => ({ date, price })),
    });
  }

  if (view === "investments") {
    const [accounts, holdings, days] = await Promise.all([
      prisma.finAccount.findMany({
        where: { isActive: true, type: { in: ["investment", "crypto"] } },
        include: { institution: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),
      latestHoldings(),
      historyDays(),
    ]);

    // Day change per holding: last two closes × qty.
    const holdingsOut = await Promise.all(
      holdings.map(async (h) => {
        let dayChange: number | null = null;
        let dayChangePct: number | null = null;
        if (h.symbol && h.quantity != null) {
          const m = await priceSeries(h.symbol, h.account.type === "crypto");
          const closes = [...m.values()];
          const prev = closes[closes.length - 2];
          const last = closes[closes.length - 1];
          if (prev != null && last != null && prev !== 0) {
            dayChange = (last - prev) * h.quantity;
            dayChangePct = ((last - prev) / prev) * 100;
          }
        }
        return {
          id: h.id,
          accountId: h.accountId,
          symbol: h.symbol,
          description: h.description,
          quantity: h.quantity,
          price: h.price,
          value: h.value,
          costBasis: h.costBasis,
          asOf: h.asOf,
          dayChange,
          dayChangePct,
        };
      })
    );

    const byAcct = new Map<string, typeof holdingsOut>();
    for (const h of holdingsOut) {
      const arr = byAcct.get(h.accountId) ?? [];
      arr.push(h);
      byAcct.set(h.accountId, arr);
    }

    const merged = new Map<string, number>();
    const accountsOut = [];
    for (const a of accounts) {
      const series = await investmentSeries(a.id, days);
      const pts = [...series.entries()].map(([date, value]) => ({ date, value }));
      for (const [d, v] of series) merged.set(d, (merged.get(d) ?? 0) + v);
      const last = pts[pts.length - 1]?.value ?? a.currentBalance ?? 0;
      const prev = pts[pts.length - 2]?.value ?? last;
      const hs = byAcct.get(a.id) ?? [];
      accountsOut.push({
        id: a.id,
        name: a.name,
        type: a.type,
        institution: a.institution.name,
        balance: a.currentBalance ?? last,
        dayChange: last - prev,
        dayChangePct: prev !== 0 ? ((last - prev) / prev) * 100 : null,
        costBasis: hs.reduce((s, h) => s + (h.costBasis ?? 0), 0) || null,
        series: pts,
        holdings: hs.sort((x, y) => (y.value ?? 0) - (x.value ?? 0)),
      });
    }

    const growth = [...merged.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
    const totalValue = accountsOut.reduce((s, a) => s + a.balance, 0);
    const totalCostBasis = accountsOut.reduce((s, a) => s + (a.costBasis ?? 0), 0);
    const gLast = growth[growth.length - 1]?.value ?? totalValue;
    const gPrev = growth[growth.length - 2]?.value ?? gLast;
    return Response.json({
      accounts: accountsOut,
      growth,
      totalValue,
      totalCostBasis,
      dayChange: gLast - gPrev,
      dayChangePct: gPrev !== 0 ? ((gLast - gPrev) / gPrev) * 100 : null,
    });
  }

  if (view === "explorer") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    const categoryId = url.searchParams.get("categoryId");
    const accountId = url.searchParams.get("accountId");
    const granularity = url.searchParams.get("granularity") ?? "month";

    const where: Prisma.FinTransactionWhereInput = excludeHidden({ status: "posted" });
    if (categoryId) where.categoryId = categoryId;
    if (accountId) where.accountId = accountId;
    if (q) {
      const include: string[] = [];
      const exclude: string[] = [];
      for (const tok of q.split(/\s+/).filter(Boolean)) {
        if (tok.startsWith("!")) exclude.push(tok.slice(1));
        else include.push(tok);
      }
      where.AND = [
        ...include.map((t) => ({
          OR: [{ description: { contains: t } }, { merchantName: { contains: t } }],
        })),
        ...exclude.map((t) => ({
          NOT: { OR: [{ description: { contains: t } }, { merchantName: { contains: t } }] },
        })),
      ];
    }

    const txs = await prisma.finTransaction.findMany({
      where,
      select: { date: true, amount: true, description: true, merchantName: true },
      orderBy: { date: "asc" },
    });

    const buckets = new Map<string, { spend: number; income: number; count: number }>();
    for (const t of txs) {
      const key =
        granularity === "year"
          ? String(t.date.getFullYear())
          : monthKey(t.date);
      const b = buckets.get(key) ?? { spend: 0, income: 0, count: 0 };
      if (t.amount < 0) b.spend += -t.amount;
      else b.income += t.amount;
      b.count++;
      buckets.set(key, b);
    }
    const series = [...buckets.entries()].map(([period, b]) => ({ period, ...b }));
    return Response.json({
      series,
      totalSpend: series.reduce((s, b) => s + b.spend, 0),
      totalIncome: series.reduce((s, b) => s + b.income, 0),
      count: txs.length,
      earliest: txs[0]?.date ?? null,
      latest: txs[txs.length - 1]?.date ?? null,
    });
  }

  // spending + cashflow share the same aggregation; granularity=week buckets
  // by Monday instead of month (used for short ranges).
  const months = Math.min(120, Math.max(1, parseInt(url.searchParams.get("months") ?? "12", 10)));
  const granularity = url.searchParams.get("granularity") ?? "month";
  const bucketKey = granularity === "week" ? weekKey : monthKey;
  const from = new Date();
  from.setMonth(from.getMonth() - months + 1);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const txs = await prisma.finTransaction.findMany({
    where: excludeHidden({ date: { gte: from }, status: "posted" }),
    select: {
      date: true,
      amount: true,
      transactionType: true,
      category: { select: { name: true, color: true, isIncome: true } },
      account: { select: { type: true } },
    },
  });

  const isExcluded = (t: (typeof txs)[number]) =>
    // An explicit Income category wins over a TRANSFER_* type (e.g. recurring
    // inflows from an unlinked account the user marked as income).
    (isTransferLike(t) && t.category?.isIncome !== true) ||
    // Positive amounts on credit cards/loans are payments/refunds, not income.
    (t.amount > 0 && LIABILITY_TYPES.has(t.account?.type ?? ""));

  if (view === "cashflow") {
    const buckets = new Map<string, { spend: number; income: number }>();
    for (const t of txs) {
      if (isExcluded(t)) continue;
      const key = bucketKey(t.date);
      const b = buckets.get(key) ?? { spend: 0, income: 0 };
      if (t.amount < 0) b.spend += -t.amount;
      else b.income += t.amount;
      buckets.set(key, b);
    }
    return Response.json({
      series: [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, b]) => ({ period, ...b, net: b.income - b.spend })),
    });
  }

  // view=spending — category totals per month
  const buckets = new Map<string, Map<string, { total: number; color: string }>>();
  for (const t of txs) {
    if (t.amount >= 0 || isExcluded(t)) continue;
    const key = monthKey(t.date);
    const cat = t.category?.name ?? "Uncategorized";
    const m = buckets.get(key) ?? new Map();
    const cur = m.get(cat) ?? { total: 0, color: t.category?.color ?? "#64748b" };
    cur.total += -t.amount;
    m.set(cat, cur);
    buckets.set(key, m);
  }
  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, cats]) => ({
      period,
      categories: [...cats.entries()].map(([name, v]) => ({ name, ...v })),
      total: [...cats.values()].reduce((s, c) => s + c.total, 0),
    }));
  return Response.json({ series });
}
