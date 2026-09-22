"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Widget } from "@/components/layout/Widget";
import { VillageSummary, VillageCategories } from "./VillageTracker";
import { StatIcon } from "./icons";
import { iconUrl } from "@/lib/coc/village";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MeData {
  configured: boolean;
  tag?: string;
  inClan?: boolean;
  live?: {
    name: string;
    townHall: number;
    expLevel: number;
    trophies: number;
    bestTrophies: number;
    league: string | null;
    leagueIcon: string | null;
    legendTrophies: number | null;
    warStars: number;
    donations: number;
    heroes: { name: string; level: number; maxLevel: number }[];
    equipment: { name: string; level: number; maxLevel: number }[];
  } | null;
  battles?: {
    ts: string;
    type: string;
    stars: number | null;
    destruction: number | null;
    trophiesDelta: number | null;
    opponentName: string | null;
    opponentTH: number | null;
  }[];
  series?: {
    ts: string;
    trophies: number;
    legendTrophies: number | null;
    warStars: number;
    donations: number;
  }[];
}

export function MePanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<MeData | null>(null);

  useEffect(() => {
    fetch("/api/coc/me")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ configured: false }));
  }, [refreshKey]);

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data.configured)
    return (
      <Widget title="Setup required">
        <p className="text-sm text-muted-foreground">
          Set <code>coc.playerTag</code> in{" "}
          <Link href="/settings" className="text-primary underline">
            Settings
          </Link>{" "}
          to track your account.
        </p>
      </Widget>
    );

  const { live, battles = [], series = [] } = data;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <Widget title={live ? `${live.name} · TH${live.townHall}` : "Profile"}>
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
              <span className="tabular-nums">{live.warStars.toLocaleString()}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <StatIcon icon="donationsOut" /> Donations
              </span>
              <span className="tabular-nums">{live.donations.toLocaleString()}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <StatIcon icon="xp" /> XP level
              </span>
              <span className="tabular-nums">{live.expLevel}</span>
            </div>
            {live.heroes.length > 0 && (
              <div className="mt-1">
                <p className="mb-1 text-xs text-muted-foreground">Heroes</p>
                <div className="flex flex-wrap gap-1.5">
                  {live.heroes.map((h) => (
                    <span
                      key={h.name}
                      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums ${
                        h.level >= h.maxLevel
                          ? "border-green-500/40 text-green-400"
                          : "border-border"
                      }`}
                    >
                      <StatIcon icon={iconUrl("hero", h.name)} size={22} />
                      {h.name} {h.level}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {live.equipment.length > 0 && (
              <div className="mt-1">
                <p className="mb-1 text-xs text-muted-foreground">Equipment</p>
                <div className="flex flex-wrap gap-1.5">
                  {live.equipment.map((e) => (
                    <span
                      key={e.name}
                      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums ${
                        e.level >= e.maxLevel
                          ? "border-green-500/40 text-green-400"
                          : "border-border"
                      }`}
                    >
                      <StatIcon icon={iconUrl("equipment", e.name)} size={22} />
                      {e.name} {e.level}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No live data — waiting for first snapshot.
          </p>
        )}
      </Widget>

      <VillageSummary refreshKey={refreshKey} />

      <VillageCategories refreshKey={refreshKey} />

      <Widget title="Recent battles" className="lg:col-span-2 xl:col-span-3">
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
                  <th className="px-2 py-1 text-right font-medium">Stars</th>
                  <th className="px-2 py-1 text-right font-medium">Destr.</th>
                  <th className="px-2 py-1 text-right font-medium">Trophies</th>
                </tr>
              </thead>
              <tbody>
                {battles.map((b, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
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
                      {b.destruction != null ? `${b.destruction.toFixed(0)}%` : "—"}
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

      <Widget title="Trophy trend" className="lg:col-span-2 xl:col-span-3">
        {series.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            The daily snapshot job builds this chart over time.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series.map((s) => ({ ...s, day: s.ts.slice(0, 10) }))}
              >
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="trophies"
                  stroke="var(--primary)"
                  dot={false}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Widget>
    </div>
  );
}
