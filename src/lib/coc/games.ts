/**
 * Clan games tracking. The official API has no clan-games endpoint, so
 * per-member points are derived by diffing the cumulative "Games Champion"
 * achievement between member snapshots (see sync.ts snapshotMembers).
 * Games run the 22nd–28th of each month, ~08:00 UTC.
 *
 * Caveats: resolution is snapshot-granularity (daily, 6h during games);
 * members who joined mid-games have no pre-games baseline so their points
 * are a lower bound (flagged `partial`).
 */

import { prisma, ensureWal } from "@/lib/db";
import { cached } from "@/lib/cache";

export const GAMES_START_DAY = 22;
export const GAMES_END_DAY = 28;
const GAMES_HOUR_UTC = 8;
/** Personal point cap — a member at this has "completed" the games. */
export const GAMES_PERSONAL_CAP = 4000;
/** How far outside the window to look for baseline/final snapshots. */
const SNAP_PAD_MS = 14 * 86400_000;

export interface GamesWindow {
  /** "2026-09" */
  season: string;
  start: Date;
  end: Date;
}

/** Games window for the month containing `d` (UTC). */
export function gamesWindow(year: number, month: number): GamesWindow {
  return {
    season: `${year}-${String(month + 1).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, month, GAMES_START_DAY, GAMES_HOUR_UTC)),
    end: new Date(Date.UTC(year, month, GAMES_END_DAY, GAMES_HOUR_UTC)),
  };
}

export type GamesPhase = "active" | "ended" | "upcoming";

/** Which games window the UI should feature right now. */
export function currentGamesPhase(now = new Date()): {
  phase: GamesPhase;
  window: GamesWindow;
  nextStart: Date;
} {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const cur = gamesWindow(y, m);
  const nextMonth = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 };
  const next = gamesWindow(nextMonth.y, nextMonth.m);

  if (now >= cur.start && now < cur.end)
    return { phase: "active", window: cur, nextStart: next.start };
  if (now >= cur.end)
    return { phase: "ended", window: cur, nextStart: next.start };
  return { phase: "upcoming", window: cur, nextStart: cur.start };
}

interface SnapPoint {
  ts: Date;
  value: number;
}

function gamesChampion(json: string | null): number | null {
  if (!json) return null;
  try {
    for (const a of JSON.parse(json) as { name: string; value: number }[]) {
      if (a.name === "Games Champion") return a.value;
    }
  } catch {
    // malformed — skip
  }
  return null;
}

export interface GamesMember {
  tag: string;
  name: string;
  inClan: boolean;
  points: number;
  capped: boolean;
  /** True when no pre-games baseline exists (joined mid-games or first
   *  tracked games) — points are a lower bound. */
  partial: boolean;
}

export interface GamesSeasonResult {
  season: string;
  start: string;
  end: string;
  total: number;
  cappedCount: number;
  members: GamesMember[];
}

/**
 * Per-member points for one games window, computed from snapshot diffs.
 * `tags` limits output to those players (default: every tag seen).
 */
async function computeSeason(
  w: GamesWindow,
  active: boolean
): Promise<GamesSeasonResult> {
  const snaps = await prisma.cocPlayerSnapshot.findMany({
    where: {
      ts: {
        gte: new Date(w.start.getTime() - SNAP_PAD_MS),
        lte: new Date(w.end.getTime() + SNAP_PAD_MS),
      },
    },
    select: { playerTag: true, ts: true, achievements: true },
    orderBy: { ts: "asc" },
  });

  // tag -> sorted series of Games Champion values
  const series = new Map<string, SnapPoint[]>();
  for (const s of snaps) {
    const v = gamesChampion(s.achievements);
    if (v == null) continue;
    const arr = series.get(s.playerTag) ?? [];
    arr.push({ ts: s.ts, value: v });
    series.set(s.playerTag, arr);
  }

  const players = await prisma.cocPlayer.findMany({
    where: { tag: { in: [...series.keys()] } },
    select: { tag: true, name: true, inClan: true },
  });
  const info = new Map(players.map((p) => [p.tag, p]));

  const members: GamesMember[] = [];
  for (const [tag, pts] of series) {
    // Baseline: last snapshot before the window; if none, earliest inside
    // it (member had no pre-games reading — points are a lower bound).
    let baseline: SnapPoint | null = null;
    let partial = false;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i].ts < w.start) {
        baseline = pts[i];
        break;
      }
    }
    if (!baseline) {
      baseline = pts[0];
      partial = true;
    }

    // Final: first snapshot at/after the end (definitive for finished
    // games); for the active window just use the latest reading.
    let final: SnapPoint | null = null;
    if (active) {
      final = pts[pts.length - 1];
    } else {
      for (const p of pts) {
        if (p.ts >= w.end) {
          final = p;
          break;
        }
      }
      if (!final) final = pts[pts.length - 1];
    }
    if (!baseline || !final || final.ts <= baseline.ts) continue;

    const points = Math.max(0, final.value - baseline.value);
    const p = info.get(tag);
    members.push({
      tag,
      name: p?.name ?? tag,
      inClan: p?.inClan ?? false,
      points,
      capped: points >= GAMES_PERSONAL_CAP,
      partial,
    });
  }

  members.sort((a, b) => b.points - a.points);
  return {
    season: w.season,
    start: w.start.toISOString(),
    end: w.end.toISOString(),
    total: members.reduce((n, m) => n + m.points, 0),
    cappedCount: members.filter((m) => m.capped).length,
    members,
  };
}

export interface ClanGames {
  phase: GamesPhase;
  season: GamesSeasonResult | null;
  nextStart: string;
  cap: number;
  /** Past seasons, newest first (excludes the featured one). */
  history: GamesSeasonResult[];
}

export function getClanGames(historyMonths = 6): Promise<ClanGames> {
  return cached("coc:games", 60_000, () => getClanGamesUncached(historyMonths));
}

async function getClanGamesUncached(historyMonths: number): Promise<ClanGames> {
  await ensureWal();
  const { phase, window, nextStart } = currentGamesPhase();

  const season =
    phase === "upcoming" ? null : await computeSeason(window, phase === "active");

  const history: GamesSeasonResult[] = [];
  let y = window.start.getUTCFullYear();
  let m = window.start.getUTCMonth();
  for (let i = 0; i < historyMonths; i++) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    const w = gamesWindow(y, m);
    if (w.end > new Date()) break;
    const s = await computeSeason(w, false);
    if (s.total > 0) history.push(s);
  }

  return {
    phase,
    season,
    nextStart: nextStart.toISOString(),
    cap: GAMES_PERSONAL_CAP,
    history,
  };
}
