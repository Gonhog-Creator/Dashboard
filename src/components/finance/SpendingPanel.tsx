"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtMoneyCompact } from "@/lib/finance/format";
import {
  RangePicker,
  fmtAxis,
  fmtMonthAxis,
  monthsForRange,
  type Range,
} from "./chart-utils";

interface CashflowPoint {
  period: string;
  spend: number;
  income: number;
  net: number;
}

interface SpendingPoint {
  period: string;
  categories: { name: string; total: number; color: string }[];
  total: number;
}

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: 12,
};

/** Spending analysis — cashflow + per-category trends. Transactions tab is
 *  for categorizing; this tab is for understanding where money goes. */
export function SpendingPanel({ refreshKey }: { refreshKey: number }) {
  const [range, setRange] = useState<Range>("ALL");
  const [cashflow, setCashflow] = useState<CashflowPoint[]>([]);
  const [statsCf, setStatsCf] = useState<CashflowPoint[]>([]);
  const [spending, setSpending] = useState<SpendingPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Weekly bars for short ranges; monthly otherwise.
  const weekly = range === "1M" || range === "3M" || range === "6M";

  useEffect(() => {
    setLoading(true);
    const months = monthsForRange(range);
    const gran = weekly ? "&granularity=week" : "";
    Promise.all([
      fetch(`/api/finance/analytics?view=cashflow&months=${months}${gran}`).then(
        (r) => r.json()
      ),
      // Stat cards always use monthly buckets regardless of chart granularity.
      fetch(`/api/finance/analytics?view=cashflow&months=3`).then((r) =>
        r.json()
      ),
      fetch(`/api/finance/analytics?view=spending&months=${months}`).then((r) =>
        r.json()
      ),
    ])
      .then(([cf, st, sp]) => {
        setCashflow(cf.series ?? []);
        setStatsCf(st.series ?? []);
        setSpending(sp.series ?? []);
      })
      .finally(() => setLoading(false));
  }, [range, weekly, refreshKey]);

  const stats = useMemo(() => {
    if (statsCf.length === 0) return null;
    const last = statsCf[statsCf.length - 1];
    const prev = statsCf[statsCf.length - 2];
    const avg = statsCf.reduce((s, p) => s + p.spend, 0) / statsCf.length;
    const mom =
      prev && prev.spend > 0 ? ((last.spend - prev.spend) / prev.spend) * 100 : null;
    return { last, avg, mom };
  }, [statsCf]);

  const catRows = useMemo(() => {
    const byCat = new Map<
      string,
      { color: string; total: number; thisMonth: number; lastMonth: number; months: number }
    >();
    const lastPeriod = spending[spending.length - 1]?.period;
    const prevPeriod = spending[spending.length - 2]?.period;
    for (const m of spending) {
      for (const c of m.categories) {
        const row =
          byCat.get(c.name) ?? {
            color: c.color,
            total: 0,
            thisMonth: 0,
            lastMonth: 0,
            months: 0,
          };
        row.total += c.total;
        row.months++;
        if (m.period === lastPeriod) row.thisMonth += c.total;
        if (m.period === prevPeriod) row.lastMonth += c.total;
        byCat.set(c.name, row);
      }
    }
    return [...byCat.entries()]
      .map(([name, r]) => ({ name, ...r, avg: r.total / Math.max(1, r.months) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [spending]);

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Spent this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {fmtMoney(stats?.last.spend ?? 0)}
          </p>
          {stats?.mom != null && (
            <p className={`mt-0.5 text-xs flex items-center gap-1 ${stats.mom > 0 ? "text-red-400" : "text-green-400"}`}>
              {stats.mom > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.abs(stats.mom).toFixed(0)}% vs last month
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Avg monthly spend</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {fmtMoney(stats?.avg ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            over {statsCf.length} months
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Income this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {fmtMoney(stats?.last.income ?? 0)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Net this month</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              (stats?.last.net ?? 0) >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {fmtMoney(stats?.last.net ?? 0)}
          </p>
        </CardContent>
      </Card>

      {/* Cashflow chart */}
      <Card className="md:col-span-2 xl:col-span-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            {weekly ? "Weekly" : "Monthly"} cashflow
          </CardTitle>
          <RangePicker value={range} onChange={setRange} />
        </CardHeader>
        <CardContent className="h-72">
          {cashflow.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={cashflow.map((p) => ({ ...p, spend: -p.spend }))}
                barCategoryGap="30%"
                stackOffset="sign"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={weekly ? fmtAxis : fmtMonthAxis} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => fmtMoneyCompact(v)} width={70} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => [
                    fmtMoney(name === "spend" ? -Number(v) : Number(v)),
                    name === "spend" ? "Spend" : name === "income" ? "Income" : "Net",
                  ]}
                />
                <Bar dataKey="income" stackId="cf" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="spend" stackId="cf" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="net" stroke="var(--primary)" strokeWidth={2} dot={false} />
                <Brush dataKey="period" height={22} stroke="var(--primary)" travellerWidth={8} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No transaction history yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category trends */}
      <Card className="md:col-span-2 xl:col-span-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Category trends
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_repeat(4,7rem)] items-center gap-x-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span>Category</span>
            <span className="text-right">This month</span>
            <span className="text-right">Last month</span>
            <span className="text-right">Avg/mo</span>
            <span className="text-right">Trend</span>
          </div>
          {catRows.map((c) => {
            const delta =
              c.lastMonth > 0
                ? ((c.thisMonth - c.lastMonth) / c.lastMonth) * 100
                : null;
            return (
              <div
                key={c.name}
                className="grid grid-cols-[1fr_repeat(4,7rem)] items-center gap-x-2 border-b border-border/50 px-4 py-2 text-sm last:border-0"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </span>
                <span className="text-right tabular-nums">{fmtMoney(c.thisMonth)}</span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {fmtMoney(c.lastMonth)}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {fmtMoney(c.avg)}
                </span>
                <span
                  className={`text-right tabular-nums ${
                    delta == null
                      ? "text-muted-foreground"
                      : delta > 5
                        ? "text-red-400"
                        : delta < -5
                          ? "text-green-400"
                          : "text-muted-foreground"
                  }`}
                >
                  {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
