"use client";

import { useEffect, useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Widget } from "@/components/layout/Widget";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatIcon } from "./icons";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface WarAttack {
  order: number;
  attackerTag: string;
  attackerName: string;
  attackerTH: number;
  defenderName: string;
  defenderTH: number;
  stars: number;
  destruction: number;
  duration: number | null;
}

interface WarMember {
  tag: string;
  name: string;
  th: number;
  pos: number;
  /** Best enemy hit on this base (only on our roster). */
  bestDef?: { stars: number; destruction: number } | null;
}

interface AttackDetail {
  war: string;
  ts: string | null;
  order: number;
  stars: number;
  destruction: number;
  duration: number | null;
  defenderName: string;
  defenderTH: number;
  thDiff: number;
}

interface MemberAnalytics {
  tag: string;
  name: string;
  townHall: number;
  wars: number;
  attacks: number;
  hitRate: number | null;
  avgStars: number;
  tripleRate: number;
  avgDestruction: number;
  avgDuration: number | null;
  defAttacks: number;
  defStars: number | null;
  defTripleRate: number | null;
  detail: AttackDetail[];
}

interface WarRow {
  id: string;
  type: string;
  season: string | null;
  state: string;
  result: string | null;
  startTime: string | null;
  endTime: string | null;
  teamSize: number;
  attacksPerMember: number;
  members: WarMember[];
  opponentMembers: WarMember[];
  opponentName: string | null;
  opponentTag: string | null;
  clanBadge: string | null;
  opponentBadge: string | null;
  preparationStartTime: string | null;
  clanAttacks: number;
  opponentAttacks: number;
  expEarned: number;
  clanStars: number;
  opponentStars: number;
  clanDestruction: number;
  opponentDestruction: number;
  attacks: WarAttack[];
}

function Stars({ n }: { n: number }) {
  return (
    <span className="tabular-nums text-yellow-400">
      {"★".repeat(n)}
      <span className="text-muted-foreground/40">{"★".repeat(3 - n)}</span>
    </span>
  );
}

const CHART_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  fontSize: 12,
};

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

/** seconds → m:ss */
function fmtDur(s: number | null): string {
  if (s == null) return "—";
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function ResultBadge({ result, state }: { result: string | null; state: string }) {
  if (state === "inWar" || state === "preparation")
    return (
      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
        LIVE
      </span>
    );
  const map: Record<string, string> = {
    win: "bg-green-500/15 text-green-400",
    lose: "bg-red-500/15 text-red-400",
    tie: "bg-yellow-500/15 text-yellow-400",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
        map[result ?? ""] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {result ?? state}
    </span>
  );
}

interface CwlClan {
  tag: string;
  name: string;
  level: number;
  members: { tag: string; name: string; th: number }[];
}

interface CwlSeason {
  season: string;
  state: string | null;
  clans: CwlClan[];
  rounds: string[][];
}

export function WarsPanel({ refreshKey }: { refreshKey: number }) {
  const [wars, setWars] = useState<WarRow[] | null>(null);
  const [analytics, setAnalytics] = useState<MemberAnalytics[] | null>(null);
  const [cwl, setCwl] = useState<CwlSeason | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "regular" | "cwl">("all");
  const [tableFull, setTableFull] = useState(false);

  useEffect(() => {
    fetch("/api/coc/wars")
      .then((r) => r.json())
      .then(setWars)
      .catch(() => setWars([]));
    fetch("/api/coc/analytics")
      .then((r) => r.json())
      .then(setAnalytics)
      .catch(() => setAnalytics([]));
    fetch("/api/coc/cwl")
      .then((r) => r.json())
      .then(setCwl)
      .catch(() => setCwl(null));
  }, [refreshKey]);

  const sortedAnalytics = useMemo(
    () => [...(analytics ?? [])].sort((a, b) => b.wars - a.wars),
    [analytics]
  );

  if (!wars) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {cwl && cwl.clans.length > 0 && (
        <Widget title={`CWL group · ${cwl.season}`}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {[...cwl.clans]
              .sort((a, b) => b.level - a.level)
              .map((c) => (
                <div key={c.tag} className="flex items-center gap-1.5 truncate">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    L{c.level} ·{" "}
                    {thHistogram(
                      c.members.map((m) => ({
                        tag: m.tag,
                        name: m.name,
                        th: m.th,
                        pos: 0,
                      }))
                    )}
                  </span>
                </div>
              ))}
          </div>
        </Widget>
      )}
      {analytics && analytics.length > 0 && (
        <Widget title="Member war analytics — all captured wars">
          {(() => {
            const sel = analytics.find((m) => m.tag === selected);
            if (!sel || sel.detail.length === 0) return null;
            const atk = sel.detail.map((d, i) => ({ ...d, i: i + 1 }));
            return (
              <div className="mb-3">
                <p className="mb-2 text-xs font-medium">
                  {sel.name}
                  <span className="ml-1 text-muted-foreground">
                    TH{sel.townHall} · {sel.attacks} attacks
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                  <MiniChart title="Stars per attack">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={atk}>
                        <XAxis dataKey="i" tick={{ fontSize: 9 }} />
                        <YAxis
                          domain={[0, 3]}
                          ticks={[0, 1, 2, 3]}
                          tick={{ fontSize: 9 }}
                          width={18}
                        />
                        <Tooltip
                          contentStyle={CHART_STYLE}
                          labelFormatter={(i) =>
                            `${atk[(i as number) - 1]?.war ?? ""} → ${
                              atk[(i as number) - 1]?.defenderName ?? ""
                            }`
                          }
                        />
                        <Bar dataKey="stars" fill="#eab308" />
                      </BarChart>
                    </ResponsiveContainer>
                  </MiniChart>
                  <MiniChart title="Attack order (timing)">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={atk}>
                        <XAxis dataKey="i" tick={{ fontSize: 9 }} />
                        <YAxis
                          reversed
                          domain={[1, "auto"]}
                          tick={{ fontSize: 9 }}
                          width={18}
                        />
                        <Tooltip
                          contentStyle={CHART_STYLE}
                          labelFormatter={(i) => atk[(i as number) - 1]?.war ?? ""}
                        />
                        <Line
                          type="monotone"
                          dataKey="order"
                          stroke="var(--primary)"
                          dot={{ r: 2 }}
                          strokeWidth={1.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </MiniChart>
                  <MiniChart title="Attack duration (s)">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={atk}>
                        <XAxis dataKey="i" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} width={28} />
                        <Tooltip
                          contentStyle={CHART_STYLE}
                          formatter={(v) => [fmtDur(v as number), "duration"]}
                          labelFormatter={(i) => atk[(i as number) - 1]?.war ?? ""}
                        />
                        <Bar dataKey="duration" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </MiniChart>
                  <MiniChart title="Matchup (TH diff → stars)">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <XAxis
                          dataKey="thDiff"
                          type="number"
                          tick={{ fontSize: 9 }}
                          name="TH diff"
                        />
                        <YAxis
                          dataKey="stars"
                          type="number"
                          domain={[0, 3]}
                          ticks={[0, 1, 2, 3]}
                          tick={{ fontSize: 9 }}
                          width={18}
                        />
                        <Tooltip
                          contentStyle={CHART_STYLE}
                          cursor={{ strokeDasharray: "3 3" }}
                          formatter={(v, name) =>
                            name === "TH diff"
                              ? [v as number, "TH diff"]
                              : [v as number, "stars"]
                          }
                        />
                        <Scatter data={atk} fill="#a855f7" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </MiniChart>
                </div>
              </div>
            );
          })()}
          <AnalyticsTable
            rows={sortedAnalytics}
            selected={selected}
            onSelect={setSelected}
          />
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Click a row for per-attack charts. Hit rate = attacks used /
              available. Def = enemy attacks on that member&apos;s base. Detail
              exists only for wars captured while active.
            </p>
            <button
              onClick={() => setTableFull(true)}
              title="Fullscreen table"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Maximize2 className="size-4" />
            </button>
          </div>
        </Widget>
      )}

      {wars.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No wars captured yet. Member-level attack history starts accumulating
          once the poll job sees your next war — the API&apos;s war log only
          exposes clan-level results.
        </p>
      )}
      {wars.length > 1 && (
        <div className="flex gap-1.5">
          {(
            [
              ["all", "All"],
              ["regular", "Regular"],
              ["cwl", "CWL"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {wars
        .filter((w) => filter === "all" || w.type === filter)
        .map((w) => {
        const triples = w.attacks.filter((a) => a.stars === 3).length;
        const avgStars =
          w.attacks.length > 0
            ? w.attacks.reduce((s, a) => s + a.stars, 0) / w.attacks.length
            : 0;
        return (
          <div
            key={w.id}
            role="button"
            tabIndex={0}
            onClick={() => setOpen(w.id)}
            onKeyDown={(e) => e.key === "Enter" && setOpen(w.id)}
            className="cursor-pointer rounded-xl outline-none transition-colors hover:bg-accent/30"
          >
            <Widget
              title={
                `${w.type === "cwl" ? "CWL " : ""}vs ${w.opponentName ?? "?"}` +
                (w.season ? ` · ${w.season}` : "")
              }
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {w.opponentBadge && (
                  <StatIcon icon={w.opponentBadge} size={22} />
                )}
                <ResultBadge result={w.result} state={w.state} />
                {w.type === "cwl" && (
                  <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-400">
                    CWL
                  </span>
                )}
                <span className="tabular-nums font-semibold">
                  {w.clanStars}★ – {w.opponentStars}★
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {w.clanDestruction.toFixed(1)}% /{" "}
                  {w.opponentDestruction.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {w.teamSize}v{w.teamSize} · {w.attacks.length} attacks ·{" "}
                  {triples} triples · avg {avgStars.toFixed(2)}★
                </span>
                {w.startTime && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(w.startTime).toLocaleDateString()}
                  </span>
                )}
              </div>
            </Widget>
          </div>
        );
      })}

      <Dialog open={tableFull} onOpenChange={setTableFull}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member war analytics</DialogTitle>
          </DialogHeader>
          <AnalyticsTable
            rows={sortedAnalytics}
            selected={selected}
            onSelect={setSelected}
            full
          />
        </DialogContent>
      </Dialog>

      <WarDetailDialog
        war={wars.find((w) => w.id === open) ?? null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

/** Member analytics table — shared between the widget and the fullscreen dialog. */
function AnalyticsTable({
  rows,
  selected,
  onSelect,
  full = false,
}: {
  rows: MemberAnalytics[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  full?: boolean;
}) {
  return (
    <div
      className={
        full
          ? "overflow-x-auto"
          : "max-h-72 overflow-y-auto overflow-x-auto"
      }
    >
      <table className="w-full text-sm">
        <thead
          className={`sticky top-0 text-xs text-muted-foreground ${
            full ? "bg-popover" : "bg-card"
          }`}
        >
          <tr className="border-b border-border text-left">
            <th className="px-2 py-1.5 font-medium">Member</th>
            <th className="px-2 py-1.5 text-right font-medium">Wars</th>
            <th className="px-2 py-1.5 text-right font-medium">Attacks</th>
            <th className="px-2 py-1.5 text-right font-medium">Hit rate</th>
            <th className="px-2 py-1.5 text-right font-medium">
              <span className="inline-flex items-center gap-1">
                <StatIcon icon="warStar" size={12} /> Avg
              </span>
            </th>
            <th className="px-2 py-1.5 text-right font-medium">3★ %</th>
            <th className="px-2 py-1.5 text-right font-medium">Avg destr.</th>
            <th className="px-2 py-1.5 text-right font-medium">Avg time</th>
            <th className="px-2 py-1.5 text-right font-medium">Def ★</th>
            <th className="px-2 py-1.5 text-right font-medium">Def 3★</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.tag}
              onClick={() => onSelect(selected === m.tag ? null : m.tag)}
              className={`cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/50 ${
                selected === m.tag ? "bg-accent/40" : ""
              }`}
            >
              <td className="px-2 py-1.5">
                {m.name}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  TH{m.townHall}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m.wars}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m.attacks}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {m.hitRate != null ? `${Math.round(m.hitRate * 100)}%` : "—"}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {m.avgStars.toFixed(2)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {Math.round(m.tripleRate * 100)}%
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {m.avgDestruction.toFixed(0)}%
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmtDur(m.avgDuration)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {m.defStars != null ? m.defStars.toFixed(2) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {m.defTripleRate != null
                  ? `${Math.round(m.defTripleRate * 100)}%`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WarDetailDialog({
  war,
  onClose,
}: {
  war: WarRow | null;
  onClose: () => void;
}) {
  // Group our attacks by attacker.
  const byAttacker = new Map<string, WarAttack[]>();
  for (const a of war?.attacks ?? []) {
    const l = byAttacker.get(a.attackerTag) ?? [];
    l.push(a);
    byAttacker.set(a.attackerTag, l);
  }

  // Roster: stored war members, else unique attackers.
  const roster: WarMember[] =
    war && war.members.length > 0
      ? [...war.members].sort((a, b) => (a.pos || 99) - (b.pos || 99))
      : [...byAttacker.entries()].map(([tag, atks]) => ({
          tag,
          name: atks[0].attackerName,
          th: atks[0].attackerTH,
          pos: 0,
        }));

  const limit = war?.attacksPerMember ?? 1;
  const didntAttack = roster.filter(
    (m) => (byAttacker.get(m.tag)?.length ?? 0) === 0
  );

  return (
    <Dialog open={war !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {war && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">
                {war.type === "cwl" ? "CWL " : ""}vs{" "}
                {war.opponentName ?? "?"}
              </DialogTitle>
              {/* CoC-style matchup: our badge — score — enemy badge */}
              <div className="flex items-center justify-center gap-4 py-1">
                {war.clanBadge && (
                  <StatIcon icon={war.clanBadge} size={44} />
                )}
                <div className="flex items-center gap-2 text-2xl font-bold tabular-nums">
                  <span>{war.clanStars}</span>
                  <StatIcon icon="warStar" size={18} />
                  <span className="text-muted-foreground">–</span>
                  <span>{war.opponentStars}</span>
                  <StatIcon icon="warStar" size={18} />
                </div>
                {war.opponentBadge && (
                  <StatIcon icon={war.opponentBadge} size={44} />
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
                <ResultBadge result={war.result} state={war.state} />
                <span className="text-muted-foreground tabular-nums">
                  {war.clanDestruction.toFixed(1)}% /{" "}
                  {war.opponentDestruction.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">
                  {war.teamSize}v{war.teamSize}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {war.clanAttacks || war.attacks.length}/
                  {war.teamSize * war.attacksPerMember} atk ·{" "}
                  {war.opponentAttacks}/
                  {war.teamSize * war.attacksPerMember} opp
                </span>
                {war.expEarned > 0 && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <StatIcon icon="xp" size={13} />+{war.expEarned}
                  </span>
                )}
                {war.startTime && (
                  <span className="text-muted-foreground">
                    {new Date(war.startTime).toLocaleDateString()}
                  </span>
                )}
              </div>
            </DialogHeader>

            {didntAttack.length > 0 && (
              <p className="rounded-md bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400">
                Didn&apos;t attack: {didntAttack.map((m) => m.name).join(", ")}
              </p>
            )}

            <table className="w-full text-base">
              <thead className="text-sm text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-1.5 font-medium">Member</th>
                  <th className="px-2 py-1.5 text-right font-medium">Atk</th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <StatIcon icon="warStar" size={14} />
                    </span>
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">Destr</th>
                  <th className="px-2 py-1.5 text-right font-medium">Def</th>
                  <th className="px-2 py-1.5 font-medium">Hits</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((m) => {
                  const atks = (byAttacker.get(m.tag) ?? []).sort(
                    (a, b) => a.order - b.order
                  );
                  const stars = atks.reduce((s, a) => s + a.stars, 0);
                  const destr =
                    atks.length > 0
                      ? atks.reduce((s, a) => s + a.destruction, 0) /
                        atks.length
                      : null;
                  const missed = atks.length < limit;
                  return (
                    <tr
                      key={m.tag}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="px-2 py-2">
                        {m.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          TH{m.th}
                        </span>
                      </td>
                      <td
                        className={`px-2 py-2 text-right tabular-nums ${
                          missed ? "font-medium text-amber-400" : ""
                        }`}
                      >
                        {atks.length}/{limit}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {atks.length > 0 ? `${stars}★` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {destr != null ? `${destr.toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {m.bestDef ? (
                          <span
                            className={
                              m.bestDef.stars === 3
                                ? "text-red-400"
                                : m.bestDef.stars === 0
                                  ? "text-green-400"
                                  : ""
                            }
                            title={`Best enemy hit: ${m.bestDef.stars}★ ${m.bestDef.destruction.toFixed(0)}%`}
                          >
                            {m.bestDef.stars}★ {m.bestDef.destruction.toFixed(0)}
                            %
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {atks.map((a) => (
                            <span
                              key={a.order}
                              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-sm tabular-nums"
                              title={`#${a.order} → ${a.defenderName} TH${a.defenderTH}`}
                            >
                              <Stars n={a.stars} />
                              {a.destruction.toFixed(0)}%
                              {a.duration != null && (
                                <span className="text-muted-foreground">
                                  {fmtDur(a.duration)}
                                </span>
                              )}
                              <span className="text-muted-foreground">
                                → {a.defenderName}
                              </span>
                            </span>
                          ))}
                          {atks.length === 0 && (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {war.opponentMembers.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Enemy lineup:{" "}
                {thHistogram(war.opponentMembers)}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "TH18 ×3 · TH17 ×8" summary of a roster. */
function thHistogram(members: WarMember[]) {
  const counts = new Map<number, number>();
  for (const m of members)
    counts.set(m.th, (counts.get(m.th) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([th, n]) => `TH${th} ×${n}`)
    .join(" · ");
}
