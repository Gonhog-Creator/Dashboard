"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Widget } from "@/components/layout/Widget";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatIcon } from "./icons";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MemberRow {
  tag: string;
  name: string;
  role: string | null;
  warPreference: string | null;
  townHall: number;
  isMe: boolean;
  clanRank: number | null;
  previousClanRank: number | null;
  liveDonations: number;
  liveDonationsReceived: number;
  trophies: number | null;
  league: string | null;
  donations: number | null;
  donationsReceived: number | null;
  capitalContributions: number | null;
  expLevel: number | null;
  warStars: number | null;
  legendTrophies: number | null;
  delta30d: {
    trophies: number;
    donations: number;
    warStars: number;
    expLevel: number;
  } | null;
  lastSnapshotAt: string | null;
}

interface HistoryPoint {
  ts: string;
  townHall: number;
  expLevel: number;
  trophies: number;
  legendTrophies: number | null;
  warStars: number;
  donations: number;
  donationsReceived: number;
  capitalContributions: number;
  attackWins: number;
  defenseWins: number;
  builderBaseTrophies: number;
  versusBattleWins: number;
  clanRank: number | null;
  goldGrab: number | null;
  elixirGrab: number | null;
  darkGrab: number | null;
  goblins: number | null;
  gamesChampion: number | null;
  heroLevels: number | null;
  equipmentLevels: number | null;
  troopLevels: number | null;
  spellLevels: number | null;
  petLevels: number | null;
}

/** Delta of a cumulative counter between consecutive snapshots; negative (season reset) → 0. */
function pointDeltas(points: HistoryPoint[], key: keyof HistoryPoint) {
  const out: { day: string; value: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1][key];
    const b = points[i][key];
    if (typeof a !== "number" || typeof b !== "number") continue;
    out.push({ day: points[i].ts.slice(0, 10), value: Math.max(0, b - a) });
  }
  return out;
}

interface ProgressEvent {
  ts: string;
  kind: string;
  text: string;
}

const LOG_KIND: Record<string, string> = {
  townhall: "bg-yellow-400",
  builderhall: "bg-orange-400",
  league: "bg-blue-400",
  upgrade: "bg-green-400",
  achievement: "bg-purple-400",
  milestone: "bg-amber-400",
  best: "bg-yellow-300",
};

const CHART_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  fontSize: 12,
};

const compact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`;

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="h-52">{children}</div>
    </div>
  );
}

type SortKey =
  | "townHall"
  | "trophies"
  | "donations"
  | "capitalContributions"
  | "expLevel"
  | "warStars";

function Delta({ v }: { v: number | undefined }) {
  if (v == null || v === 0) return <span className="text-muted-foreground">—</span>;
  const up = v > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums ${
        up ? "text-green-400" : "text-red-400"
      }`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(v).toLocaleString()}
    </span>
  );
}

export function MembersPanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [sort, setSort] = useState<SortKey>("townHall");
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [log, setLog] = useState<ProgressEvent[] | null>(null);

  useEffect(() => {
    fetch("/api/coc/members")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [refreshKey]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/coc/members?tag=${encodeURIComponent(selected)}&days=90`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory([]));
    fetch(`/api/coc/members?tag=${encodeURIComponent(selected)}&log=1`)
      .then((r) => r.json())
      .then(setLog)
      .catch(() => setLog([]));
  }, [selected]);

  const sorted = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
  }, [rows, sort]);

  if (!sorted) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!sorted.length)
    return (
      <p className="text-sm text-muted-foreground">
        No members yet — configure the clan tag and hit Sync.
      </p>
    );

  const thCounts = new Map<number, number>();
  for (const r of sorted) thCounts.set(r.townHall, (thCounts.get(r.townHall) ?? 0) + 1);

  const selectedRow = sorted.find((r) => r.tag === selected);

  const header = (key: SortKey, label: string, icon?: string) => (
    <th
      className="cursor-pointer px-2 py-1.5 text-right font-medium hover:text-foreground"
      onClick={() => setSort(key)}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {icon && <StatIcon icon={icon} size={12} />}
        {label}
        {sort === key && " ↓"}
      </span>
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <Widget title="Roster">
        <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {[...thCounts.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([th, n]) => (
              <span key={th} className="rounded border border-border px-1.5 py-0.5">
                TH{th} ×{n}
              </span>
            ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border text-left">
                <th className="px-2 py-1.5 font-medium">Member</th>
                {header("townHall", "TH")}
                {header("trophies", "Trophies", "trophy")}
                {header("donations", "Donations", "donationsOut")}
                {header("capitalContributions", "Capital", "capitalGold")}
                {header("warStars", "War stars", "warStar")}
                {header("expLevel", "Exp", "xp")}
                <th className="px-2 py-1.5 text-right font-medium">30d Δ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.tag}
                  onClick={() => {
                    setHistory(null);
                    setLog(null);
                    setSelected(r.tag === selected ? null : r.tag);
                  }}
                  className={`cursor-pointer border-b border-border/50 hover:bg-accent/50 ${
                    selected === r.tag ? "bg-accent/40" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <span className={r.isMe ? "font-semibold text-primary" : ""}>
                      {r.name}
                    </span>
                    {r.role && r.role !== "member" && (
                      <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                        {r.role === "coLeader" ? "co" : r.role === "admin" ? "elder" : r.role}
                      </span>
                    )}
                    {r.warPreference === "out" && (
                      <span className="ml-1.5 rounded bg-red-500/15 px-1 py-0.5 text-[9px] font-medium uppercase text-red-400">
                        war out
                      </span>
                    )}
                    {r.clanRank != null && (
                      <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground">
                        #{r.clanRank}
                        {r.previousClanRank != null &&
                          r.previousClanRank !== r.clanRank && (
                            <span
                              className={
                                r.clanRank < r.previousClanRank
                                  ? "text-green-400"
                                  : "text-red-400"
                              }
                            >
                              {r.clanRank < r.previousClanRank ? "↑" : "↓"}
                              {Math.abs(r.previousClanRank - r.clanRank)}
                            </span>
                          )}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.townHall}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.trophies?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {(r.liveDonations || r.donations)?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.capitalContributions?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.warStars?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.expLevel ?? "—"}
                    {r.delta30d && r.delta30d.expLevel > 0 && (
                      <span className="ml-1 text-[10px] text-green-400">
                        +{r.delta30d.expLevel}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Delta v={r.delta30d?.trophies} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          30d Δ = trophy change vs snapshot ~30 days ago. Click a row for history.
        </p>
      </Widget>

      <Sheet
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        modal={false}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-3xl"
          showOverlay={false}
        >
          {selectedRow && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedRow.name} — history</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  TH{selectedRow.townHall} · last 90 days
                </p>
              </SheetHeader>
              <div className="px-4 pb-6">
                {history === null ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : history.length < 2 ? (
                  <p className="text-sm text-muted-foreground">
                    Not enough snapshots yet — the daily job builds this over
                    time.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
              {log && log.length > 0 && (
                <ChartCard title="Progress log">
                  <div className="h-full overflow-y-auto pr-1">
                    <div className="flex flex-col gap-1">
                      {log.map((e, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-xs">
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {e.ts.slice(0, 10)}
                          </span>
                          <span
                            className={`size-1.5 shrink-0 self-center rounded-full ${
                              LOG_KIND[e.kind] ?? "bg-muted-foreground"
                            }`}
                          />
                          <span>{e.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartCard>
              )}

              <ChartCard title="Trophies">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}
                  >
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Line type="monotone" dataKey="trophies" stroke="var(--primary)" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Donations / day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pointDeltas(history, "donations")}>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} tickFormatter={(w: string) => w.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Bar dataKey="value" name="donated" fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Capital contributions / day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pointDeltas(history, "capitalContributions")}>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} tickFormatter={(w: string) => w.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Bar dataKey="value" name="contributed" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="War stars (cumulative)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}
                  >
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Line type="monotone" dataKey="warStars" stroke="#eab308" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Level totals">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}
                  >
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="heroLevels" name="heroes" stroke="#ef4444" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="troopLevels" name="troops" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="equipmentLevels" name="equipment" stroke="#a855f7" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="spellLevels" name="spells" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="petLevels" name="pets" stroke="#ec4899" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Attack wins / day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pointDeltas(history, "attackWins")}>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} tickFormatter={(w: string) => w.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Bar dataKey="value" name="wins" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Defense wins / day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pointDeltas(history, "defenseWins")}>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} tickFormatter={(w: string) => w.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Bar dataKey="value" name="defenses" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Donations received / day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pointDeltas(history, "donationsReceived")}>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} tickFormatter={(w: string) => w.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Bar dataKey="value" name="received" fill="#38bdf8" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Experience level">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Line type="monotone" dataKey="expLevel" stroke="#a855f7" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Builder base trophies">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Line type="monotone" dataKey="builderBaseTrophies" stroke="#f97316" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Versus wins / day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pointDeltas(history, "versusBattleWins")}>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} tickFormatter={(w: string) => w.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Bar dataKey="value" name="versus wins" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Clan rank (lower = better)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} reversed domain={[1, "auto"]} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Line type="monotone" dataKey="clanRank" stroke="#38bdf8" dot={{ r: 2 }} strokeWidth={1.5} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Loot grabbed (cumulative)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={compact} width={40} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="goldGrab" name="gold" stroke="#eab308" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="elixirGrab" name="elixir" stroke="#ec4899" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="darkGrab" name="dark" stroke="#7c3aed" dot={false} strokeWidth={1.5} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Goblin map stars · Clan games">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history.map((h) => ({ ...h, day: h.ts.slice(0, 10) }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="goblins" name="goblin stars" stroke="#22c55e" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="gamesChampion" name="games pts" stroke="#eab308" dot={false} strokeWidth={1.5} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
