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
import { gameItem, iconUrl } from "./village";

const WR_BASE = "https://api.warreport.app";

// ---- army share-code decoding ---------------------------------------------
// Format: h<heroIdx>p<pet>e<eq>_<eq>-… i<cc troops> d<cc spells> u<troops> s<spells>
// ids are offsets: troops +4_000_000, spells +26_000_000, heroes +28_000_000,
// pets +73_000_000, equipment +90_000_000 → gamedata.json ids.

const TROOP_BASE = 4_000_000;
const SPELL_BASE = 26_000_000;
const HERO_BASE = 28_000_000;
const PET_BASE = 73_000_000;
const EQ_BASE = 90_000_000;

export interface MetaIcon {
  name: string;
  count: number;
  icon: string | null;
}

export interface MetaArmyHero {
  name: string;
  icon: string | null;
  pet: { name: string; icon: string | null } | null;
  equipment: { name: string; icon: string | null }[];
}

export interface ArmyComposition {
  troops: MetaIcon[]; // u — army camps
  cc: MetaIcon[]; // i — clan castle / siege contents
  spells: MetaIcon[]; // s — own spells
  ccSpells: MetaIcon[]; // d — donated spells
  heroes: MetaArmyHero[];
}

export function decodeArmy(code: string): ArmyComposition {
  // Section letters never appear inside other sections' entries, so each
  // letter's first occurrence marks its section start.
  const marks = ["h", "i", "d", "u", "s"]
    .map((l) => ({ l, i: code.indexOf(l) }))
    .filter((m) => m.i >= 0)
    .sort((a, b) => a.i - b.i);
  const sec: Record<string, string> = {};
  marks.forEach((m, k) => {
    sec[m.l] = code.slice(m.i + 1, marks[k + 1]?.i ?? code.length);
  });

  const units = (
    s: string | undefined,
    base: number,
    kind: "troop" | "spell"
  ): MetaIcon[] =>
    (s ?? "").split("-").flatMap((part) => {
      const m = part.match(/^(\d+)x(\d+)$/);
      if (!m) return [];
      const it = gameItem(base + Number(m[2]));
      return it
        ? [{ name: it.name, count: Number(m[1]), icon: iconUrl(kind, it.name) }]
        : [];
    });

  const heroes: MetaArmyHero[] = (sec.h ?? "").split("-").flatMap((part) => {
    const m = part.match(/^(\d+)(?:p(\d+))?(?:e([\d_]+))?$/);
    if (!m) return [];
    const hero = gameItem(HERO_BASE + Number(m[1]));
    if (!hero) return [];
    const pet = m[2] ? gameItem(PET_BASE + Number(m[2])) : null;
    const equipment = (m[3] ?? "")
      .split("_")
      .filter(Boolean)
      .flatMap((e) => {
        const it = gameItem(EQ_BASE + Number(e));
        return it
          ? [{ name: it.name, icon: iconUrl("equipment", it.name) }]
          : [];
      });
    return [
      {
        name: hero.name,
        icon: iconUrl("hero", hero.name),
        pet: pet ? { name: pet.name, icon: iconUrl("pet", pet.name) } : null,
        equipment,
      },
    ];
  });

  return {
    troops: units(sec.u, TROOP_BASE, "troop"),
    cc: units(sec.i, TROOP_BASE, "troop"),
    spells: units(sec.s, SPELL_BASE, "spell"),
    ccSpells: units(sec.d, SPELL_BASE, "spell"),
    heroes,
  };
}

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
  armies: (WrArmy & { composition: ArmyComposition })[];
  heroes: (WrHeroUsage & { icon: string | null })[];
  equipment: (Omit<WrHeroEquipment, "equipment"> & {
    heroIcon: string | null;
    equipment: (WrHeroEquipment["equipment"][number] & {
      icon: string | null;
    })[];
  })[];
  battleStats:
    | (Omit<WrBattleStatsDay, "armies"> & {
        armies: (WrBattleStatsArmy & { composition: ArmyComposition })[];
      })
    | null;
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
    armies: (armies ?? []).map((a) => ({
      ...a,
      composition: decodeArmy(a.armyShareCode),
    })),
    heroes: (heroes ?? []).map((h) => ({
      ...h,
      icon: iconUrl("hero", h.name),
    })),
    equipment: (equipment ?? []).map((h) => ({
      ...h,
      heroIcon: iconUrl("hero", h.heroName),
      equipment: h.equipment.map((e) => ({
        ...e,
        icon: iconUrl("equipment", e.name),
      })),
    })),
    battleStats: battleStats
      ? {
          ...battleStats,
          armies: battleStats.armies.map((a) => ({
            ...a,
            composition: decodeArmy(a.armyShareCode),
          })),
        }
      : null,
    fetchedAt:
      latest.reduce<string | null>(
        (acc, r) => (r.fetchedAt.toISOString() > (acc ?? "") ? r.fetchedAt.toISOString() : acc),
        null
      ) ?? null,
    attribution: "Meta data: War Report (warreport.app)",
  };
}
