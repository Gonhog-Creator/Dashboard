"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtMoneyCompact } from "@/lib/finance/format";
import {
  RangePicker,
  cutoffFor,
  fmtAxis,
  type Range,
} from "./chart-utils";

interface Overview {
  netWorth: number;
  assets: number;
  liabilities: number;
  monthSpend: number;
  monthIncome: number;
  prevSpend: number;
  prevIncome: number;
  avgSpend3m: number;
  savingsRate: number | null;
  prevSavingsRate: number | null;
  categories: { name: string; color: string; total: number }[];
  topMerchants: { name: string; total: number }[];
  netWorthSeries: { date: string; value: number }[];
  recurring: { id: string; displayName: string; amount: number | null; frequency: string; nextExpected: string | null }[];
  recurringMonthly: number;
  verdicts: string[];
  accountCount: number;
}

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: 12,
};

export function OverviewPanel({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number;
  onNavigate?: (tab: string) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nwRange, setNwRange] = useState<Range>("ALL");

  useEffect(() => {
    fetch("/api/finance/overview")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [refreshKey]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-96 w-full" />;

  if (data.accountCount === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">No accounts yet</p>
          <p className="text-sm">
            Connect an institution or drop a statement file in the{" "}
            <strong>Connections</strong> tab to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  const spendDelta =
    data.prevSpend > 0
      ? ((data.monthSpend - data.prevSpend) / data.prevSpend) * 100
      : null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {/* Stat cards */}
      <StatCard
        label="Net worth"
        value={fmtMoney(data.netWorth)}
        sub={`${fmtMoneyCompact(data.assets)} assets · ${fmtMoneyCompact(data.liabilities)} liabilities`}
      />
      <StatCard
        label="Spent this month"
        value={fmtMoney(data.monthSpend)}
        sub={
          spendDelta != null
            ? `${spendDelta > 0 ? "+" : ""}${spendDelta.toFixed(0)}% vs last month`
            : undefined
        }
        icon={spendDelta != null && spendDelta > 0 ? <TrendingUp className="size-4 text-red-400" /> : <TrendingDown className="size-4 text-green-400" />}
        onClick={() => onNavigate?.("spending")}
      />
      <StatCard
        label="Income this month"
        value={fmtMoney(data.monthIncome)}
        sub={`${fmtMoney(data.prevIncome)} last month`}
      />
      <StatCard
        label="Savings rate"
        value={
          data.savingsRate != null
            ? `${(data.savingsRate * 100).toFixed(0)}%`
            : data.prevSavingsRate != null
              ? `${(data.prevSavingsRate * 100).toFixed(0)}%`
              : "—"
        }
        sub={
          data.savingsRate == null && data.prevSavingsRate != null
            ? "last month · income lands on the 24th"
            : `${fmtMoneyCompact(data.recurringMonthly)}/mo recurring`
        }
        onClick={() => onNavigate?.("investments")}
      />

      {/* Verdicts */}
      {data.verdicts.length > 0 && (
        <Card className="md:col-span-2 xl:col-span-4">
          <CardContent className="flex flex-wrap gap-x-6 gap-y-1 py-3">
            {data.verdicts.map((v) => (
              <span key={v} className="flex items-center gap-1.5 text-sm">
                <AlertCircle className="size-3.5 text-primary" />
                {v}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Net worth chart */}
      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm text-muted-foreground">Net worth over time</CardTitle>
          <RangePicker value={nwRange} onChange={setNwRange} />
        </CardHeader>
        <CardContent className="h-56">
          {(() => {
            const cutoff = cutoffFor(nwRange);
            const nw = cutoff
              ? data.netWorthSeries.filter((p) => p.date >= cutoff)
              : data.netWorthSeries;
            return nw.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={nw}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={fmtAxis} minTickGap={40} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => fmtMoneyCompact(v)} width={70} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
                <Area type="monotone" dataKey="value" stroke="var(--primary)" fill="color-mix(in oklab, var(--primary) 15%, transparent)" />
                <Brush dataKey="date" height={22} stroke="var(--primary)" travellerWidth={8} />
              </AreaChart>
            </ResponsiveContainer>
            ) : (
              <EmptyChart text="Snapshots accumulate daily — check back tomorrow" />
            );
          })()}
        </CardContent>
      </Card>

      {/* Income vs spend */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">This month vs last</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { name: "Last month", spend: data.prevSpend, income: data.prevIncome },
                { name: "This month", spend: data.monthSpend, income: data.monthIncome },
              ]}
            >
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => fmtMoneyCompact(v)} width={70} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
              <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spend" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Category donut */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Spending by category</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          {data.categories.length > 0 ? (
            <div className="flex h-full items-center gap-4">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categories.slice(0, 8)}
                    dataKey="total"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    label={false}
                  >
                    {data.categories.slice(0, 8).map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtMoney(Number(v)), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="min-w-0 flex-1 space-y-1 overflow-y-auto max-h-full">
                {data.categories.slice(0, 8).map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {fmtMoneyCompact(c.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart text="No spending this month" />
          )}
        </CardContent>
      </Card>

      {/* Top merchants + recurring */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Top merchants this month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {data.topMerchants.length === 0 && (
            <p className="text-sm text-muted-foreground">No spending yet.</p>
          )}
          {data.topMerchants.map((m) => (
            <div key={m.name} className="flex items-center justify-between text-sm">
              <span className="truncate pr-4">{m.name}</span>
              <span className="tabular-nums text-muted-foreground">{fmtMoney(m.total)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer transition-colors hover:bg-accent/50" : undefined}
      onClick={onClick}
    >
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
