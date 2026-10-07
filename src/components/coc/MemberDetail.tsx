"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Widget } from "@/components/layout/Widget";
import { VillageSummary, VillageCategories } from "./VillageTracker";
import { StatIcon } from "./icons";
import { iconUrl, maxLevelForTH } from "@/lib/coc/village";
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

interface Unit {
  name: string;
  level: number;
  maxLevel: number;
}

interface MemberDetailData {
  tag: string;
  inClan: boolean;
  name: string;
  live: {
    name: string;
    townHall: number;
    builderHall: number | null;
    expLevel: number;
    trophies: number;
    bestTrophies: number;
    builderBaseTrophies: number;
    league: string | null;
    leagueIcon: string | null;
    builderBaseLeague: string | null;
    legendTrophies: number | null;
    warStars: number;
    donations: number;
    donationsReceived: number;
    capitalContributions: number;
    role: string | null;
    clanName: string | null;
    thIcon: string | null;
    heroes: Unit[];
    equipment: Unit[];
    troops: Unit[];
    spells: Unit[];
    pets: Unit[];
  } | null;
  battles: {
    ts: string;
    type: string;
    stars: number | null;
    destruction: number | null;
    trophiesDelta: number | null;
    opponentName: string | null;
    opponentTH: number | null;
  }[];
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

interface ProgressEvent {
  ts: string;
  kind: string;
  text: string;
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
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-border p-3 ${className}`}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="h-52">{children}</div>
    </div>
  );
}

type IconKindFor = "hero" | "equipment" | "troop" | "spell" | "pet";

/** green = absolute max, light bronze = maxed for the member's TH. */
function unitChipClass(level: number, maxLevel: number, thMax: number | null) {
  if (level >= maxLevel) return "border-green-500/40 text-green-400";
  if (thMax != null && level >= thMax)
    return "border-[#c08552]/60 text-[#e2b48f]";
  return "border-border";
}

function UnitChip({
  unit,
  kind,
  th,
}: {
  unit: Unit;
  kind: IconKindFor;
  th: number;
}) {
  const thMax = maxLevelForTH(unit.name, th);
  return (
    <span
      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums ${unitChipClass(
        unit.level,
        unit.maxLevel,
        thMax
      )}`}
      title={`${unit.name} ${unit.level}/${unit.maxLevel}${
        thMax != null && thMax < unit.maxLevel ? ` (TH${th} max ${thMax})` : ""
      }`}
    >
      <StatIcon icon={iconUrl(kind, unit.name)} size={22} />
      {unit.name} {unit.level}
    </span>
  );
}

function UnitGroup({
  title,
  units,
  kind,
  th,
}: {
  title: string;
  units: Unit[];
  kind: IconKindFor;
  th: number;
}) {
  if (!units.length) return null;
  return (
    <div className="mt-1">
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {units.map((u) => (
          <UnitChip key={u.name} unit={u} kind={kind} th={th} />
        ))}
      </div>
    </div>
  );
}

/**
 * Full-screen member profile — a clone of the Me tab for any clan member.
 * Buildings/traps only exist for the configured player (village export), so
 * the village tracker renders only when isMe.
 */
export function MemberDetail({
  tag,
  isMe,
  onClose,
}: {
  tag: string | null;
  isMe: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<MemberDetailData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [log, setLog] = useState<ProgressEvent[] | null>(null);

  useEffect(() => {
    if (!tag) return;
    setDetail(null);
    setHistory(null);
    setLog(null);
    const q = encodeURIComponent(tag);
    fetch(`/api/coc/members?tag=${q}&detail=1`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => setDetail(null));
    fetch(`/api/coc/members?tag=${q}&days=90`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory([]));
    fetch(`/api/coc/members?tag=${q}&log=1`)
      .then((r) => r.json())
      .then(setLog)
      .catch(() => setLog([]));
  }, [tag]);

  const live = detail?.live ?? null;
  const battles = detail?.battles ?? [];

  return (
    <Dialog open={tag !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
        showCloseButton
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3 pr-12">
          {live?.thIcon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={live.thIcon} alt="" className="size-9 object-contain" />
          )}
          <div>
            <DialogTitle className="text-lg">
              {detail?.name ?? "Loading…"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {tag} ·{" "}
              {live
                ? `TH${live.townHall}${
                    live.builderHall ? ` · BH${live.builderHall}` : ""
                  }`
                : detail
                  ? "live profile unavailable"
                  : ""}
              {live?.clanName ? ` · ${live.clanName}` : ""}
              {live?.role && live.role !== "member"
                ? ` · ${live.role === "coLeader" ? "co-leader" : live.role === "admin" ? "elder" : live.role}`
                : ""}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {/* Profile — mirrors MePanel */}
            <Widget
              title={live ? `${live.name} · TH${live.townHall}` : "Profile"}
            >
              {live ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <StatIcon icon="trophy" /> Trophies
                    </span>
                    <span className="tabular-nums">
                      {live.trophies.toLocaleString()}
                      <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <StatIcon icon="trophyBest" size={12} />
                        {live.bestTrophies.toLocaleString()}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {live.leagueIcon ? (
                        <StatIcon icon={live.leagueIcon} />
                      ) : (
                        <StatIcon icon="legend" />
                      )}
                      League
                    </span>
                    <span>{live.league ?? "—"}</span>
                    {live.legendTrophies != null && (
                      <>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <StatIcon icon="legend" /> Legend trophies
                        </span>
                        <span className="tabular-nums">
                          {live.legendTrophies.toLocaleString()}
                        </span>
                      </>
                    )}
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <StatIcon icon="warStar" /> War stars
                    </span>
                    <span className="tabular-nums">
                      {live.warStars.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <StatIcon icon="donationsOut" /> Donations
                    </span>
                    <span className="tabular-nums">
                      {live.donations.toLocaleString()}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        recv {live.donationsReceived.toLocaleString()}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <StatIcon icon="capitalGold" /> Capital
                    </span>
                    <span className="tabular-nums">
                      {live.capitalContributions.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <StatIcon icon="xp" /> XP level
                    </span>
                    <span className="tabular-nums">{live.expLevel}</span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <StatIcon icon="trophy" /> Builder base
                    </span>
                    <span className="tabular-nums">
                      {live.builderBaseTrophies.toLocaleString()}
                      {live.builderBaseLeague && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {live.builderBaseLeague}
                        </span>
                      )}
                    </span>
                  </div>
                  <UnitGroup
                    title="Heroes"
                    units={live.heroes}
                    kind="hero"
                    th={live.townHall}
                  />
                  <UnitGroup
                    title="Equipment"
                    units={live.equipment}
                    kind="equipment"
                    th={live.townHall}
                  />
                  <UnitGroup
                    title="Pets"
                    units={live.pets}
                    kind="pet"
                    th={live.townHall}
                  />
                </div>
              ) : detail === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Live profile unavailable — the API didn&apos;t respond. History
                  below is from stored snapshots.
                </p>
              )}
            </Widget>

            {/* Troops + spells get their own card — they're long lists */}
            {live && (live.troops.length > 0 || live.spells.length > 0) && (
              <Widget title="Army" className="lg:col-span-1 xl:col-span-2">
                <UnitGroup
                  title="Troops"
                  units={live.troops}
                  kind="troop"
                  th={live.townHall}
                />
                <UnitGroup
                  title="Spells"
                  units={live.spells}
                  kind="spell"
                  th={live.townHall}
                />
              </Widget>
            )}

            {/* Village tracker — buildings only exist for the configured
                player's own export */}
            {isMe && (
              <>
                <VillageSummary refreshKey={0} />
                <VillageCategories refreshKey={0} />
              </>
            )}

            {/* Recent battles */}
            <Widget
              title="Recent battles"
              className="lg:col-span-2 xl:col-span-3"
            >
              {battles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No battle log entries yet — the hourly job pulls{" "}
                  <code>/players/{"{tag}"}/battlelog</code> for tracked players.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border text-left">
                        <th className="px-2 py-1 font-medium">When</th>
                        <th className="px-2 py-1 font-medium">Type</th>
                        <th className="px-2 py-1 font-medium">Opponent</th>
                        <th className="px-2 py-1 text-right font-medium">
                          Stars
                        </th>
                        <th className="px-2 py-1 text-right font-medium">
                          Destr.
                        </th>
                        <th className="px-2 py-1 text-right font-medium">
                          Trophies
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {battles.map((b, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/40 last:border-0"
                        >
                          <td className="px-2 py-1 text-muted-foreground tabular-nums">
                            {new Date(b.ts).toLocaleString()}
                          </td>
                          <td className="px-2 py-1">{b.type}</td>
                          <td className="px-2 py-1">
                            {b.opponentName ?? "—"}
                            {b.opponentTH != null && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                TH{b.opponentTH}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {b.stars != null ? (
                              <span className="inline-flex items-center justify-end gap-0.5">
                                {b.stars}
                                <StatIcon icon="warStar" size={11} />
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {b.destruction != null
                              ? `${b.destruction.toFixed(0)}%`
                              : "—"}
                          </td>
                          <td
                            className={`px-2 py-1 text-right tabular-nums ${
                              (b.trophiesDelta ?? 0) > 0
                                ? "text-green-400"
                                : (b.trophiesDelta ?? 0) < 0
                                  ? "text-red-400"
                                  : ""
                            }`}
                          >
                            {b.trophiesDelta != null
                              ? `${b.trophiesDelta > 0 ? "+" : ""}${b.trophiesDelta}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Widget>

            {/* History charts — same set as the old side sheet */}
            <div className="grid grid-cols-1 gap-3 lg:col-span-2 lg:grid-cols-2 xl:col-span-3">
              <h2 className="col-span-full text-sm font-medium text-muted-foreground">
                History — last 90 days
              </h2>
              {history === null ? (
                <p className="col-span-full text-sm text-muted-foreground">
                  Loading…
                </p>
              ) : history.length < 2 ? (
                <p className="col-span-full text-sm text-muted-foreground">
                  Not enough snapshots yet — the daily job builds this over
                  time.
                </p>
              ) : (
                <>
                  {log && log.length > 0 && (
                    <ChartCard title="Progress log">
                      <div className="h-full overflow-y-auto pr-1">
                        <div className="flex flex-col gap-1">
                          {log.map((e, i) => (
                            <div
                              key={i}
                              className="flex items-baseline gap-2 text-xs"
                            >
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
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Line
                          type="monotone"
                          dataKey="trophies"
                          stroke="var(--primary)"
                          dot={false}
                          strokeWidth={1.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Donations / day">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pointDeltas(history, "donations")}>
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(w: string) => w.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Bar
                          dataKey="value"
                          name="donated"
                          fill="var(--primary)"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Capital contributions / day">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pointDeltas(history, "capitalContributions")}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(w: string) => w.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Bar
                          dataKey="value"
                          name="contributed"
                          fill="#f59e0b"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="War stars (cumulative)">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Line
                          type="monotone"
                          dataKey="warStars"
                          stroke="#eab308"
                          dot={false}
                          strokeWidth={1.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Level totals">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line
                          type="monotone"
                          dataKey="heroLevels"
                          name="heroes"
                          stroke="#ef4444"
                          dot={false}
                          strokeWidth={1.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="troopLevels"
                          name="troops"
                          stroke="#22c55e"
                          dot={false}
                          strokeWidth={1.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="equipmentLevels"
                          name="equipment"
                          stroke="#a855f7"
                          dot={false}
                          strokeWidth={1.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="spellLevels"
                          name="spells"
                          stroke="#3b82f6"
                          dot={false}
                          strokeWidth={1.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="petLevels"
                          name="pets"
                          stroke="#ec4899"
                          dot={false}
                          strokeWidth={1.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Attack wins / day">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pointDeltas(history, "attackWins")}>
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(w: string) => w.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Bar dataKey="value" name="wins" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Defense wins / day">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pointDeltas(history, "defenseWins")}>
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(w: string) => w.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Bar dataKey="value" name="defenses" fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Donations received / day">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pointDeltas(history, "donationsReceived")}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(w: string) => w.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Bar
                          dataKey="value"
                          name="received"
                          fill="#38bdf8"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Experience level">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Line
                          type="monotone"
                          dataKey="expLevel"
                          stroke="#a855f7"
                          dot={false}
                          strokeWidth={1.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Builder base trophies">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Line
                          type="monotone"
                          dataKey="builderBaseTrophies"
                          stroke="#f97316"
                          dot={false}
                          strokeWidth={1.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Versus wins / day">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pointDeltas(history, "versusBattleWins")}>
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 9 }}
                          tickFormatter={(w: string) => w.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Bar
                          dataKey="value"
                          name="versus wins"
                          fill="#f97316"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Clan rank (lower = better)">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          reversed
                          domain={[1, "auto"]}
                        />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Line
                          type="monotone"
                          dataKey="clanRank"
                          stroke="#38bdf8"
                          dot={{ r: 2 }}
                          strokeWidth={1.5}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Loot grabbed (cumulative)">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={compact}
                          width={40}
                        />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line
                          type="monotone"
                          dataKey="goldGrab"
                          name="gold"
                          stroke="#eab308"
                          dot={false}
                          strokeWidth={1.5}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="elixirGrab"
                          name="elixir"
                          stroke="#ec4899"
                          dot={false}
                          strokeWidth={1.5}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="darkGrab"
                          name="dark"
                          stroke="#7c3aed"
                          dot={false}
                          strokeWidth={1.5}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Goblin map stars · Clan games">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={history.map((h) => ({
                          ...h,
                          day: h.ts.slice(0, 10),
                        }))}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={CHART_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line
                          type="monotone"
                          dataKey="goblins"
                          name="goblin stars"
                          stroke="#22c55e"
                          dot={false}
                          strokeWidth={1.5}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="gamesChampion"
                          name="games pts"
                          stroke="#eab308"
                          dot={false}
                          strokeWidth={1.5}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
