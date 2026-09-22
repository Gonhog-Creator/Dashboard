"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtMoneyCompact, fmtDate } from "@/lib/finance/format";
import {
  RangePicker,
  cutoffFor,
  fmtAxis,
  type Range,
} from "./chart-utils";

interface Holding {
  id: string;
  accountId: string;
  symbol: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  value: number | null;
  costBasis: number | null;
  asOf: string;
  dayChange: number | null;
  dayChangePct: number | null;
}

interface Account {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  dayChange: number;
  dayChangePct: number | null;
  costBasis: number | null;
  series: { date: string; value: number }[];
  holdings: Holding[];
}

interface InvestmentsData {
  accounts: Account[];
  growth: { date: string; value: number }[];
  totalValue: number;
  totalCostBasis: number;
  dayChange: number;
  dayChangePct: number | null;
}

const PALETTE = [
  "#3b82f6", "#22c55e", "#f97316", "#a78bfa", "#ec4899",
  "#38bdf8", "#eab308", "#f43f5e", "#34d399", "#fb923c",
];

const TYPE_LABEL: Record<string, string> = {
  investment: "Brokerage",
  crypto: "Crypto",
};

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: 12,
};

function Change({ value, pct }: { value: number | null; pct?: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const up = value >= 0;
  return (
    <span className={up ? "text-green-400" : "text-red-400"}>
      {up ? "+" : ""}
      {fmtMoney(value)}
      {pct != null && ` (${up ? "+" : ""}${pct.toFixed(2)}%)`}
    </span>
  );
}

/** Stacked per-account area chart — Fidelity-style composition view. */
function StackedChart({
  accounts,
  range,
}: {
  accounts: Account[];
  range: Range;
}) {
  const cutoff = cutoffFor(range);
  const merged = new Map<string, Record<string, number | string>>();
  accounts.forEach((a, i) => {
    for (const p of a.series) {
      if (cutoff && p.date < cutoff) continue;
      const row = merged.get(p.date) ?? { date: p.date };
      row[a.name] = p.value;
      merged.set(p.date, row);
    }
  });
  const data = [...merged.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  // Fidelity-style tight domain on the stack total.
  const totals = data.map((row) =>
    accounts.reduce((s, a) => s + (Number(row[a.name]) || 0), 0)
  );
  const lo = Math.min(...totals);
  const hi = Math.max(...totals);
  const pad = (hi - lo) * 0.05 || hi * 0.05 || 1;
  const yDomain: [number, number] = [Math.max(0, lo - pad), hi + pad];
  if (data.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Not enough history yet.
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickFormatter={fmtAxis}
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickFormatter={(v) => fmtMoneyCompact(v)}
              width={70}
              domain={yDomain}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, name) => [fmtMoney(Number(v)), name]}
            />
            {accounts.map((a, i) => (
              <Area
                key={a.id}
                type="monotone"
                dataKey={a.name}
                stackId="1"
                stroke={PALETTE[i % PALETTE.length]}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={0.55}
              />
            ))}
            <Brush dataKey="date" height={22} stroke="var(--muted-foreground)" travellerWidth={8} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {accounts.map((a, i) => (
          <div key={a.id} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
            />
            <span className="text-muted-foreground">{a.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValueChart({
  data,
  range,
  color = "#22c55e",
}: {
  data: { date: string; value: number }[];
  range: Range;
  color?: string;
}) {
  const cutoff = cutoffFor(range);
  const filtered = cutoff ? data.filter((p) => p.date >= cutoff) : data;
  const vals = filtered.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.05 || hi * 0.05 || 1;
  const yDomain: [number, number] = [Math.max(0, lo - pad), hi + pad];
  if (filtered.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Not enough history yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={filtered}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          tickFormatter={fmtAxis}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          tickFormatter={(v) => fmtMoneyCompact(v)}
          width={70}
          domain={yDomain}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
        <Area type="monotone" dataKey="value" stroke={color} fill={`${color}20`} />
        <Brush dataKey="date" height={22} stroke={color} travellerWidth={8} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PositionChart({ symbol, crypto }: { symbol: string; crypto: boolean }) {
  const [series, setSeries] = useState<{ date: string; price: number }[] | null>(null);
  useEffect(() => {
    setSeries(null);
    fetch(`/api/finance/analytics?view=position&symbol=${encodeURIComponent(symbol)}&crypto=${crypto ? 1 : 0}`)
      .then((r) => r.json())
      .then((d) => setSeries(d.series ?? []))
      .catch(() => setSeries([]));
  }, [symbol, crypto]);

  if (!series) return <Skeleton className="h-48 w-full" />;
  if (series.length < 2)
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No price history for {symbol}.
      </div>
    );
  const up = series[series.length - 1].price >= series[0].price;
  const prices = series.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo) * 0.05 || hi * 0.05 || 1;
  const yDomain: [number, number] = [Math.max(0, lo - pad), hi + pad];
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            tickFormatter={fmtAxis}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
            width={70}
            domain={yDomain}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
          <Line type="monotone" dataKey="price" stroke={up ? "#22c55e" : "#f43f5e"} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PositionsTable({
  holdings,
  crypto,
  onSelect,
}: {
  holdings: Holding[];
  crypto: boolean;
  onSelect: (h: Holding) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Day Change</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Cost Basis</TableHead>
          <TableHead className="text-right">Total Gain</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((h) => {
          const gain =
            h.value != null && h.costBasis != null ? h.value - h.costBasis : null;
          const gainPct =
            gain != null && h.costBasis ? (gain / h.costBasis) * 100 : null;
          return (
            <TableRow
              key={h.id}
              className={h.symbol ? "cursor-pointer" : ""}
              onClick={() => h.symbol && onSelect(h)}
            >
              <TableCell>
                <div className="font-medium">{h.symbol ?? "—"}</div>
                <div className="max-w-48 truncate text-xs text-muted-foreground">
                  {h.description}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {h.quantity != null
                  ? h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(h.price)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <Change value={h.dayChange} pct={h.dayChangePct} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(h.value)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(h.costBasis)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <Change value={gain} pct={gainPct} />
              </TableCell>
            </TableRow>
          );
        })}
        {holdings.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              No positions — import a Fidelity positions CSV or connect Plaid.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function InvestmentsPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<InvestmentsData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [position, setPosition] = useState<Holding | null>(null);
  const [growthRange, setGrowthRange] = useState<Range>("ALL");
  const [acctRange, setAcctRange] = useState<Range>("ALL");

  useEffect(() => {
    fetch("/api/finance/analytics?view=investments")
      .then((r) => r.json())
      .then(setData)
      .catch(() =>
        setData({ accounts: [], growth: [], totalValue: 0, totalCostBasis: 0, dayChange: 0, dayChangePct: null })
      );
  }, [refreshKey]);

  if (!data) return <Skeleton className="h-96 w-full" />;

  const selected = data.accounts.find((a) => a.id === selectedId) ?? null;

  // ---------- account detail ----------
  if (selected) {
    const gain =
      selected.costBasis != null ? selected.balance - selected.costBasis : null;
    const gainPct =
      gain != null && selected.costBasis ? (gain / selected.costBasis) * 100 : null;
    return (
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedId(null);
              setPosition(null);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            ← All accounts
          </button>
          <div>
            <p className="font-semibold">{selected.name}</p>
            <p className="text-xs text-muted-foreground">
              {selected.institution} · {TYPE_LABEL[selected.type] ?? selected.type}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtMoney(selected.balance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Day change</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                <Change value={selected.dayChange} pct={selected.dayChangePct} />
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Total gain vs cost basis</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {gain != null ? <Change value={gain} pct={gainPct} /> : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Account value</CardTitle>
            <RangePicker value={acctRange} onChange={setAcctRange} />
          </CardHeader>
          <CardContent className="h-72">
            <ValueChart data={selected.series} range={acctRange} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Positions ({selected.holdings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PositionsTable
              holdings={selected.holdings}
              crypto={selected.type === "crypto"}
              onSelect={setPosition}
            />
          </CardContent>
        </Card>

        {position?.symbol && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {position.symbol} — {position.description}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PositionChart symbol={position.symbol} crypto={selected.type === "crypto"} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ---------- all accounts landing ----------
  const gain = data.totalValue - data.totalCostBasis;
  const gainPct = data.totalCostBasis > 0 ? (gain / data.totalCostBasis) * 100 : null;

  const allocation = data.accounts
    .filter((a) => a.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map((a, i) => ({ name: a.name, value: a.balance, color: PALETTE[i % PALETTE.length] }));

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Total portfolio value</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(data.totalValue)}</p>
          {gainPct != null && (
            <p className="mt-0.5 text-xs">
              <Change value={gain} pct={gainPct} /> <span className="text-muted-foreground">vs cost basis</span>
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Day change</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            <Change value={data.dayChange} pct={data.dayChangePct} />
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">Accounts</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{data.accounts.length}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.accounts.reduce((s, a) => s + a.holdings.length, 0)} positions
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm text-muted-foreground">Portfolio value</CardTitle>
          <RangePicker value={growthRange} onChange={setGrowthRange} />
        </CardHeader>
        <CardContent className="h-72">
          <StackedChart accounts={data.accounts} range={growthRange} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Allocation by account</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {allocation.length > 0 ? (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="50%"
                      outerRadius="85%"
                      paddingAngle={2}
                      label={false}
                    >
                      {allocation.map((a, i) => (
                        <Cell key={`${a.name}-${i}`} fill={a.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v, name) => [fmtMoney(Number(v)), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1">
                {allocation.map((a) => (
                  <div key={a.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: a.color }}
                    />
                    <span className="truncate text-muted-foreground">{a.name}</span>
                    <span className="ml-auto tabular-nums">
                      {fmtMoneyCompact(a.value)}
                      <span className="ml-1 text-muted-foreground">
                        {((a.value / data.totalValue) * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No investment accounts yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Positions</TableHead>
                <TableHead className="text-right">Day Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(a.id)}
                >
                  <TableCell>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.institution}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {TYPE_LABEL[a.type] ?? a.type}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.holdings.length}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Change value={a.dayChange} pct={a.dayChangePct} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {fmtMoney(a.balance)}
                  </TableCell>
                </TableRow>
              ))}
              {data.accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No investment accounts — connect Plaid or import statements.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
