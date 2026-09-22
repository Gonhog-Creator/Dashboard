import { prisma } from "@/lib/db";
import { excludeHidden } from "./exclusions";

/** Historical reconstruction — balance/portfolio series built from
 *  transactions + daily price history (stooq, free/no key), so charts
 *  have data before FinBalanceSnapshot accumulates. */

const LIABILITY_TYPES = new Set(["credit_card", "loan"]);
const DAY = 86400000;
const MAX_RANGE_DAYS = 5 * 365; // hard cap; actual start = earliest data

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    out.push(dayStr(new Date(t)));
  }
  return out;
}

// ---------- price history ----------

const priceCache = new Map<string, Map<string, number>>();

/** Daily closes via Yahoo Finance chart API (keyless). Stocks/funds: `VOO`;
 *  crypto: `ETH-USD`. */
export async function priceSeries(
  symbol: string,
  isCrypto: boolean
): Promise<Map<string, number>> {
  const key = `${isCrypto ? "c" : "s"}:${symbol.toUpperCase()}`;
  const hit = priceCache.get(key);
  if (hit) return hit;
  const ticker = isCrypto ? `${symbol.toUpperCase()}-USD` : symbol.toUpperCase();
  const map = new Map<string, number>();
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.ok) {
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const ts: number[] = result?.timestamp ?? [];
      const closes: (number | null)[] =
        result?.indicators?.quote?.[0]?.close ?? [];
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c != null && Number.isFinite(c)) {
          map.set(new Date(ts[i] * 1000).toISOString().slice(0, 10), c);
        }
      }
    }
  } catch {
    /* no data — caller falls back to flat */
  }
  priceCache.set(key, map);
  return map;
}

export async function latestHoldings() {
  const all = await prisma.finHolding.findMany({
    orderBy: { asOf: "desc" },
    include: { account: { select: { type: true } } },
  });
  const latest = new Map<string, (typeof all)[number]>();
  for (const h of all) {
    const key = `${h.accountId}|${h.symbol ?? h.description}`;
    if (!latest.has(key)) latest.set(key, h);
  }
  return [...latest.values()];
}

/** Estimated portfolio value per day — assumes current quantities held
 *  throughout (no trade history). Forward-fills prices across gaps. */
export async function portfolioValueSeries(
  accountId?: string,
  from?: string
): Promise<{ date: string; value: number }[]> {
  const holdings = (await latestHoldings()).filter(
    (h) =>
      h.symbol != null &&
      h.quantity != null &&
      (!accountId || h.accountId === accountId)
  );
  if (holdings.length === 0) return [];

  const cutoff = from ?? dayStr(new Date(Date.now() - MAX_RANGE_DAYS * DAY));
  const perHolding: { sorted: [string, number][]; qty: number }[] = [];
  const allDates = new Set<string>();

  for (const h of holdings) {
    const m = await priceSeries(h.symbol!, h.account.type === "crypto");
    let sorted = [...m.entries()].filter(([d]) => d >= cutoff).sort() as [
      string,
      number,
    ][];
    if (sorted.length === 0 && h.price) {
      sorted = [[dayStr(new Date()), h.price]];
    }
    if (sorted.length === 0) continue;
    for (const [d] of sorted) allDates.add(d);
    perHolding.push({ sorted, qty: h.quantity! });
  }
  if (allDates.size === 0) return [];

  const dates = [...allDates].sort();
  const idx = perHolding.map(() => 0);
  // Seed with first known price so early dates aren't zeroed.
  const cur = perHolding.map((h) => h.sorted[0][1]);
  const out: { date: string; value: number }[] = [];
  for (const d of dates) {
    let total = 0;
    perHolding.forEach((h, i) => {
      while (idx[i] < h.sorted.length && h.sorted[idx[i]][0] <= d) {
        cur[i] = h.sorted[idx[i]][1];
        idx[i]++;
      }
      total += cur[i] * h.qty;
    });
    out.push({ date: d, value: total });
  }
  return out;
}

/** Day list covering all known history: earliest transaction or balance
 *  snapshot, capped at MAX_RANGE_DAYS. */
export async function historyDays(): Promise<string[]> {
  const [firstTx, firstSnap] = await Promise.all([
    prisma.finTransaction.findFirst({
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.finBalanceSnapshot.findFirst({
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates = [firstTx?.date, firstSnap ? new Date(`${firstSnap.date}T00:00:00Z`) : undefined]
    .filter((d): d is Date => d != null && !Number.isNaN(d.getTime()));
  const earliest = candidates.reduce((min, d) => (d < min ? d : min), today);
  const start = new Date(
    Math.max(earliest.getTime(), today.getTime() - MAX_RANGE_DAYS * DAY)
  );
  return eachDay(start, today);
}

/** Blended daily value series for one investment/crypto account: statement
 *  snapshots where they exist, forward-fill between them, price
 *  reconstruction after the last snapshot, flat back-fill before the first. */
export async function investmentSeries(
  accountId: string,
  days: string[]
): Promise<Map<string, number>> {
  const [s, snaps] = await Promise.all([
    portfolioValueSeries(accountId, days[0]),
    prisma.finBalanceSnapshot.findMany({
      where: { accountId },
      orderBy: { date: "asc" },
    }),
  ]);
  const recon = new Map(s.map((p) => [p.date, p.value]));
  const snapMap = new Map(snaps.map((x) => [x.date, x.balance]));
  const firstSnap = snaps[0]?.date;
  // value(d) = recon(d) + offset, where offset re-anchors at each snapshot
  // (snap - recon at that date). Before the first snapshot, anchor to it so
  // early history still shows daily movement instead of a flat line.
  let offset = 0;
  if (firstSnap) {
    const r0 = recon.get(firstSnap);
    offset = r0 != null ? (snapMap.get(firstSnap) ?? 0) - r0 : 0;
  }
  let last = firstSnap ? (snapMap.get(firstSnap) ?? 0) : (s[0]?.value ?? 0);
  const m = new Map<string, number>();
  for (const d of days) {
    const snap = snapMap.get(d);
    const rv = recon.get(d);
    if (snap != null) {
      last = snap;
      if (rv != null) offset = snap - rv;
    } else if (rv != null) {
      last = rv + offset;
    }
    // no recon point (weekend/holiday/pre-coverage) → carry last
    m.set(d, last);
  }
  return m;
}

// ---------- net worth ----------

/** Reconstructed daily net worth: bank/CC balances walked back from
 *  currentBalance through transaction history; investment/crypto
 *  accounts valued via portfolioValueSeries. */
export async function netWorthSeries(): Promise<{ date: string; value: number }[]> {
  const [accounts, txs] = await Promise.all([
    prisma.finAccount.findMany({ where: { isActive: true } }),
    prisma.finTransaction.findMany({
      where: excludeHidden({}),
      select: { accountId: true, date: true, amount: true },
    }),
  ]);
  if (accounts.length === 0) return [];

  const days = await historyDays();

  // Per-account daily delta sums
  const deltas = new Map<string, Map<string, number>>();
  for (const t of txs) {
    const d = dayStr(t.date);
    const m = deltas.get(t.accountId) ?? new Map<string, number>();
    m.set(d, (m.get(d) ?? 0) + t.amount);
    deltas.set(t.accountId, m);
  }

  // accountId -> Map<date, balance>
  const perAcct = new Map<string, Map<string, number>>();
  const investAccounts: string[] = [];

  for (const a of accounts) {
    if (a.type === "investment" || a.type === "crypto") {
      investAccounts.push(a.id);
      continue;
    }
    const cur = a.currentBalance ?? 0;
    const dm = deltas.get(a.id) ?? new Map<string, number>();
    const total = [...dm.values()].reduce((s, v) => s + v, 0);
    const series = new Map<string, number>();
    if (LIABILITY_TYPES.has(a.type)) {
      // Owed balance: purchases (negative amt) raise it, payments (positive)
      // lower it — the inverse of asset accounts. owed(d) = current + Σ_{t>d}.
      let owed = cur + total;
      for (const d of days) {
        owed -= dm.get(d) ?? 0;
        series.set(d, owed);
      }
    } else {
      // balance(d) = current - Σ_{t>d} = (current - total) + Σ_{t<=d}
      let bal = cur - total;
      for (const d of days) {
        bal += dm.get(d) ?? 0;
        series.set(d, bal);
      }
    }
    perAcct.set(a.id, series);
  }

  for (const id of investAccounts) {
    perAcct.set(id, await investmentSeries(id, days));
  }

  // Merge: for each day, sum signed balances (liabilities negative).
  const out: { date: string; value: number }[] = [];
  const lastVal = new Map<string, number>();
  for (const d of days) {
    let nw = 0;
    for (const a of accounts) {
      const series = perAcct.get(a.id);
      const v = series?.get(d);
      if (v != null) lastVal.set(a.id, v);
      const bal = lastVal.get(a.id) ?? a.currentBalance ?? 0;
      nw += LIABILITY_TYPES.has(a.type) ? -bal : bal;
    }
    out.push({ date: d, value: nw });
  }
  return out;
}
