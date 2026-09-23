"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Users } from "lucide-react";
import { Widget } from "@/components/layout/Widget";
import { StatIcon } from "./icons";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RaidMember {
  tag: string;
  name: string;
  attacks: number;
  attackLimit: number;
  bonusAttackLimit: number;
  capitalResourcesLooted: number;
}

interface RaidSeason {
  seasonId: string;
  state: string | null;
  startTime: string | null;
  endTime: string | null;
  capitalTotalLoot: number;
  raidsCompleted: number;
  totalAttacks: number;
  enemyDistrictsDestroyed: number;
  offensiveReward: number;
  defensiveReward: number;
  members: RaidMember[];
  attackLog: RaidLogClan[];
  defenseLog: RaidLogClan[];
}

interface RaidDistrict {
  id: number;
  name: string;
  districtHallLevel: number;
  destructionPercent: number;
  attackCount: number;
  totalLooted: number;
}

interface RaidLogClan {
  defender?: { tag: string; name?: string; districtHallLevel?: number };
  attacker?: { tag: string; name?: string };
  districts?: RaidDistrict[];
}

const CHART_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  fontSize: 12,
};

const compact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`;

function MiniChart({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">
        {title}
      </p>
      <div className="h-28">{children}</div>
    </div>
  );
}

function fmtDate(iso: string | null, fallback: string) {
  return iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : fallback;
}

/** Real member count, or estimate from totalAttacks (max 6 attacks/player). */
function playerCount(s: RaidSeason): { n: number; estimated: boolean } {
  if (s.members.length > 0) return { n: s.members.length, estimated: false };
  return { n: Math.ceil(s.totalAttacks / 6), estimated: true };
}

export function CapitalPanel({ refreshKey }: { refreshKey: number }) {
  const [seasons, setSeasons] = useState<RaidSeason[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [selMember, setSelMember] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");

  useEffect(() => {
    fetch("/api/coc/raids")
      .then((r) => r.json())
      .then(setSeasons)
      .catch(() => setSeasons([]));
  }, [refreshKey]);

  // Chronological series for the trend charts.
  const trend = useMemo(
    () =>
      [...(seasons ?? [])].reverse().map((s) => ({
        date: fmtDate(s.startTime, s.seasonId),
        loot: s.capitalTotalLoot,
        participants: playerCount(s).n,
        attacks: s.totalAttacks,
      })),
    [seasons]
  );

  // Selected member's loot across all weekends.
  const memberHistory = useMemo(() => {
    if (!selMember || !seasons) return [];
    return [...seasons].reverse().map((s) => {
      const m = s.members.find((x) => x.tag === selMember);
      return {
        date: fmtDate(s.startTime, s.seasonId),
        loot: m ? m.capitalResourcesLooted : null,
      };
    });
  }, [seasons, selMember]);

  const selName =
    seasons
      ?.flatMap((s) => s.members)
      .find((m) => m.tag === selMember)?.name ?? null;

  if (!seasons) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!seasons.length)
    return (
      <p className="text-sm text-muted-foreground">
        No raid weekends synced yet — hit Sync or wait for the raids job.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {trend.length > 1 && (
        <Widget title="Raid trends">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <MiniChart title="Capital gold per weekend">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    width={34}
                    tickFormatter={compact}
                  />
                  <Tooltip
                    contentStyle={CHART_STYLE}
                    formatter={(v) => [
                      (v as number).toLocaleString(),
                      "capital gold",
                    ]}
                  />
                  <Bar dataKey="loot" fill="#eab308" />
                </BarChart>
              </ResponsiveContainer>
            </MiniChart>
            <MiniChart title="Participants / attacks">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={24} />
                  <Tooltip contentStyle={CHART_STYLE} />
                  <Line
                    type="monotone"
                    dataKey="participants"
                    stroke="var(--primary)"
                    dot={{ r: 2 }}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="attacks"
                    stroke="#22c55e"
                    strokeDasharray="4 3"
                    dot={{ r: 2 }}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </MiniChart>
          </div>
        </Widget>
      )}

      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setView("list")}
          title="Row view"
          className={`rounded-md border border-border p-1.5 transition-colors ${
            view === "list"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          <List className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setView("grid")}
          title="Grid view"
          className={`rounded-md border border-border p-1.5 transition-colors ${
            view === "grid"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          <LayoutGrid className="size-3.5" />
        </button>
      </div>

      <div
        className={
          view === "grid"
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
            : "flex flex-col gap-3"
        }
      >
      {seasons.map((s) => {
        const sorted = [...s.members].sort(
          (a, b) => b.capitalResourcesLooted - a.capitalResourcesLooted
        );
        const date = s.startTime
          ? new Date(s.startTime).toLocaleDateString()
          : s.seasonId;
        const unused = s.members.filter(
          (m) => m.attacks < m.attackLimit + m.bonusAttackLimit
        ).length;
        const players = playerCount(s);
        return (
          <div
            key={s.seasonId}
            role="button"
            tabIndex={0}
            onClick={() => setOpen(s.seasonId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen(s.seasonId);
              }
            }}
            className="cursor-pointer outline-none"
          >
          <Widget
            title={`Raid weekend · ${date}`}
            className="h-full transition-colors hover:border-primary/50"
          >
            <div className="w-full text-left">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                  <StatIcon icon="capitalGold" size={15} />
                  {s.capitalTotalLoot.toLocaleString()}
                </span>
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <StatIcon icon="raidAttack" size={13} />
                  {s.totalAttacks} attacks
                </span>
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <Users className="size-3" />
                  {players.estimated ? "~" : ""}
                  {players.n} players
                </span>
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <StatIcon icon="capitalTrophy" size={13} />
                  {s.raidsCompleted} raids · {s.enemyDistrictsDestroyed} districts
                </span>
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <StatIcon icon="raidMedals" size={13} />+
                  {(s.offensiveReward + s.defensiveReward).toLocaleString()}
                </span>
                {unused > 0 && (
                  <span className="ml-auto text-xs font-medium text-amber-400">
                    {unused} unused attack{unused === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            <Dialog
              open={open === s.seasonId}
              onOpenChange={(o) => {
                if (!o) {
                  setOpen(null);
                  setSelMember(null);
                }
              }}
            >
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Raid weekend · {date}</DialogTitle>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                      <StatIcon icon="capitalGold" size={15} />
                      {s.capitalTotalLoot.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                      <StatIcon icon="raidAttack" size={13} />
                      {s.totalAttacks} attacks
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                      <Users className="size-3" />
                      {players.estimated ? "~" : ""}
                      {players.n} players
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                      <StatIcon icon="capitalTrophy" size={13} />
                      {s.raidsCompleted} raids · {s.enemyDistrictsDestroyed} districts
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                      <StatIcon icon="raidMedals" size={13} />+
                      {(s.offensiveReward + s.defensiveReward).toLocaleString()}
                    </span>
                    {unused > 0 && (
                      <span className="font-medium text-amber-400">
                        {unused} unused attack{unused === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </DialogHeader>
                {sorted.length > 0 && (
              <div>
                <div>
                  <table className="w-full text-base">
                    <thead className="sticky top-0 bg-popover text-sm text-muted-foreground">
                      <tr className="border-b border-border text-left">
                        <th className="px-2 py-1 font-medium">#</th>
                        <th className="px-2 py-1 font-medium">Member</th>
                        <th className="px-2 py-1 text-right font-medium">
                          Attacks
                        </th>
                        <th className="px-2 py-1 text-right font-medium">
                          Looted
                        </th>
                        <th className="px-2 py-1 text-right font-medium">
                          Share
                        </th>
                        <th className="px-2 py-1 text-right font-medium">
                          / atk
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((m, i) => {
                        const limit = m.attackLimit + m.bonusAttackLimit;
                        const missed = m.attacks < limit;
                        return (
                          <tr
                            key={m.tag}
                            onClick={() =>
                              setSelMember(selMember === m.tag ? null : m.tag)
                            }
                            className={`cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/50 ${
                              selMember === m.tag ? "bg-accent/40" : ""
                            }`}
                          >
                            <td className="px-2 py-1 tabular-nums text-muted-foreground">
                              {i + 1}
                            </td>
                            <td className="px-2 py-1">{m.name}</td>
                            <td
                              className={`px-2 py-1 text-right tabular-nums ${
                                missed ? "text-amber-400" : ""
                              }`}
                            >
                              {m.attacks}/{limit}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {m.capitalResourcesLooted.toLocaleString()}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                              {s.capitalTotalLoot > 0
                                ? `${(
                                    (m.capitalResourcesLooted /
                                      s.capitalTotalLoot) *
                                    100
                                  ).toFixed(0)}%`
                                : "—"}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                              {m.attacks > 0
                                ? Math.round(
                                    m.capitalResourcesLooted / m.attacks
                                  ).toLocaleString()
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(s.attackLog.length > 0 || s.defenseLog.length > 0) && (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Districts
                    </p>
                    <div className="flex flex-col gap-1.5 text-xs">
                      {s.attackLog.map((c, i) => (
                        <div key={`a${i}`}>
                          <span className="font-medium">
                            {c.defender?.name ?? "Enemy clan"}
                          </span>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                            {(c.districts ?? []).map((d) => (
                              <span key={d.id} className="tabular-nums">
                                {d.name}{" "}
                                <span
                                  className={
                                    d.destructionPercent >= 100
                                      ? "text-green-400"
                                      : ""
                                  }
                                >
                                  {d.destructionPercent}%
                                </span>{" "}
                                ({d.attackCount} atk)
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {s.defenseLog.length > 0 && (
                        <div>
                          <span className="font-medium text-red-400/80">
                            Lost on defense
                          </span>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                            {s.defenseLog.flatMap((c, i) =>
                              (c.districts ?? [])
                                .filter((d) => d.destructionPercent >= 100)
                                .map((d) => (
                                  <span key={`d${i}-${d.id}`} className="tabular-nums">
                                    {d.name} ({d.attackCount} atk by{" "}
                                    {c.attacker?.name ?? "?"})
                                  </span>
                                ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {selMember && selName && (
                  <div className="mt-3">
                    <MiniChart title={`${selName} — loot per weekend`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={memberHistory}>
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                          <YAxis
                            tick={{ fontSize: 9 }}
                            width={34}
                            tickFormatter={compact}
                          />
                          <Tooltip
                            contentStyle={CHART_STYLE}
                            formatter={(v) => [
                              v == null
                                ? "didn't raid"
                                : (v as number).toLocaleString(),
                              "looted",
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="loot"
                            stroke="#eab308"
                            dot={{ r: 2 }}
                            strokeWidth={1.5}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </MiniChart>
                  </div>
                )}
              </div>
                )}
              </DialogContent>
            </Dialog>
          </Widget>
          </div>
        );
      })}
      </div>
    </div>
  );
}
