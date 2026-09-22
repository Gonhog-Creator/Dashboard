/**
 * Legend League meta data via the War Report public API
 * (https://api.warreport.app — no key required, attribution required).
 *
 * They snapshot daily: popular armies + hero/equipment usage from the top-200
 * legend players (05:15 UTC), and full per-army battle stats for each legend
 * day (06:00 UTC). We mirror their payloads into CocMetaSnapshot so the Meta
 * tab renders instantly and keeps history.
 */

import { prisma, ensureWal } from "@/lib/db";
import { cached } from "@/lib/cache";

const WR_BASE = "https://api.warreport.app";

export interface WrArmy {
  name: string;
  canonicalKey: string;
  armyShareCode: string;
  armyLink: string;
  playerCount: number;
  useCount: number;
  percentage: number;
  averageStars: number;
  averageDestruction: number;
}

export interface WrHeroUsage {
  id: number;
  name: string;
  count: number;
  percentage: number;
}

export interface WrHeroEquipment {
  heroId: number;
  heroName: string;
  heroCount: number;
  equipment: { id: number; name: string; count: number; percentage: number }[];
  combinations: { ids: number[]; label: string; count: number; percentage: number }[];
}

export interface WrBattleStatsArmy {
  name: string;
  armyShareCode: string;
  usageCount: number;
  playerCount: number;
  stars: [number, number, number, number];
  totalDestruction: number;
}

export interface WrBattleStatsDay {
  date: string;
  totalAttacks: number;
  totalPlayers: number;
  stars: [number, number, number, number];
  totalDestruction: number;
  armies: WrBattleStatsArmy[];
}

async function wrFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${WR_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`War Report ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Daily job: mirror the latest War Report snapshots into the DB. */
export async function syncMeta(): Promise<string> {
  await ensureWal();
  const date = todayUtc();
  const [armies, heroes, equipment, dates] = await Promise.all([
    wrFetch<WrArmy[]>("/armies"),
    wrFetch<WrHeroUsage[]>("/armies/heroes"),
    wrFetch<WrHeroEquipment[]>("/armies/equipment"),
    wrFetch<string[]>("/battle-stats/dates"),
  ]);

  const latestDay = dates[0];
  const battleStats = latestDay
    ? await wrFetch<WrBattleStatsDay>(`/battle-stats?date=${latestDay}&top=25`)
    : null;

  const rows = [
    { kind: "armies", date, payload: JSON.stringify(armies) },
    { kind: "heroes", date, payload: JSON.stringify(heroes) },
    { kind: "equipment", date, payload: JSON.stringify(equipment) },
    ...(battleStats
      ? [
          {
            kind: "battle-stats",
            date: battleStats.date,
            payload: JSON.stringify(battleStats),
          },
        ]
      : []),
  ];

  for (const r of rows) {
    await prisma.cocMetaSnapshot.upsert({
      where: { kind_date: { kind: r.kind, date: r.date } },
      update: { payload: r.payload, fetchedAt: new Date() },
      create: r,
    });
  }
  return `meta synced (${rows.length} snapshots, battle day ${battleStats?.date ?? "n/a"})`;
}

export interface CocMetaData {
  armies: WrArmy[];
  heroes: WrHeroUsage[];
  equipment: WrHeroEquipment[];
  battleStats: WrBattleStatsDay | null;
  fetchedAt: string | null;
  attribution: string;
}

/** Latest meta for the Meta tab — DB first, live fetch as fallback. */
export function getMeta(): Promise<CocMetaData> {
  return cached("coc:meta", 30 * 60_000, getMetaUncached);
}

async function getMetaUncached(): Promise<CocMetaData> {
  await ensureWal();
  const latest = await prisma.cocMetaSnapshot.findMany({
    orderBy: { fetchedAt: "desc" },
    distinct: ["kind"],
  });

  const byKind = new Map(latest.map((r) => [r.kind, r]));
  const parse = <T>(kind: string): T | null => {
    const row = byKind.get(kind);
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as T;
    } catch {
      return null;
    }
  };

  const armies = parse<WrArmy[]>("armies");
  const heroes = parse<WrHeroUsage[]>("heroes");
  const equipment = parse<WrHeroEquipment[]>("equipment");
  const battleStats = parse<WrBattleStatsDay>("battle-stats");

  // Cold start: nothing mirrored yet — pull live and store.
  if (!armies || !heroes || !equipment) {
    try {
      await syncMeta();
      return getMetaUncached();
    } catch {
      // fall through with whatever we have
    }
  }

  return {
    armies: armies ?? [],
    heroes: heroes ?? [],
    equipment: equipment ?? [],
    battleStats: battleStats ?? null,
    fetchedAt:
      latest.reduce<string | null>(
        (acc, r) => (r.fetchedAt.toISOString() > (acc ?? "") ? r.fetchedAt.toISOString() : acc),
        null
      ) ?? null,
    attribution: "Meta data: War Report (warreport.app)",
  };
}
