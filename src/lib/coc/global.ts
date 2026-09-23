/**
 * Global statistics (ClashSpot-style leaderboards) — all sourced from the
 * official CoC API location rankings + league endpoints. Cached in-memory;
 * rankings barely move minute-to-minute so 30min is plenty fresh.
 */

import {
  api,
  GLOBAL_LOCATION_ID,
  type CocLocation,
  type CocRankedPlayer,
  type CocRankedClan,
  type CocRankedBBPlayer,
  type CocLeague,
  type CocLegendEntry,
} from "./client";
import { prisma, ensureWal } from "@/lib/db";
import { cached } from "@/lib/cache";

const TTL = 30 * 60_000; // 30min per location payload
const LOC_TTL = 24 * 3600_000; // location list basically never changes

/** War distributions computed from every attack we've captured (both sides). */
export interface WarStats {
  wars: number;
  attacks: number;
  playersTracked: number;
  /** Distinct players seen per TH level: [{th, count}]. */
  thDist: { th: number; count: number }[];
  /** Attacks per star result: [{stars, count}]. */
  starsDist: { stars: number; count: number }[];
  /** Destruction histogram, 10% buckets: [{bucket:"0-10", count}]. */
  destructionDist: { bucket: string; count: number }[];
  /** Duration histogram, 30s buckets: [{bucket:"0:00-0:30", count}]. */
  durationDist: { bucket: string; count: number }[];
  /** Avg stars by attacker−defender TH diff: [{thDiff, avgStars, count}]. */
  thDiffStars: { thDiff: number; avgStars: number; count: number }[];
  /** Same three distributions split by war type. */
  regular: { starsDist: { stars: number; count: number }[] };
  cwl: { starsDist: { stars: number; count: number }[] };
}

export interface GlobalStats {
  location: { id: number; name: string };
  locations: CocLocation[];
  players: CocRankedPlayer[];
  clans: CocRankedClan[];
  bbPlayers: CocRankedBBPlayer[];
  bbClans: CocRankedClan[];
  capitals: CocRankedClan[];
  legend: { season: string | null; players: CocLegendEntry[] };
  leagues: {
    home: CocLeague[];
    war: { id: number; name: string }[];
    capital: { id: number; name: string }[];
    builderBase: CocLeague[];
  };
  warStats: WarStats;
  fetchedAt: string;
}

/** Location picker list — Global first, then countries A→Z. Cached 24h. */
export function getLocations(): Promise<CocLocation[]> {
  return cached("coc:locations", LOC_TTL, async () => {
    const r = await api.locations();
    return r.items.sort((a, b) =>
      a.isCountry === b.isCountry ? a.name.localeCompare(b.name) : a.isCountry ? 1 : -1
    );
  });
}

/** ClashSpot-style war distributions from every attack we've captured. */
export function getWarStats(): Promise<WarStats> {
  return cached("coc:warstats", TTL, async () => {
    await ensureWal();
    const attacks = await prisma.cocWarAttack.findMany({
      select: {
        attackerTag: true,
        attackerTH: true,
        defenderTag: true,
        defenderTH: true,
        stars: true,
        destruction: true,
        duration: true,
        war: { select: { type: true } },
      },
    });
    const wars = await prisma.cocWar.count();

    // Distinct players per TH (both sides of every war).
    const thByPlayer = new Map<string, number>();
    for (const a of attacks) {
      if (a.attackerTH > 0) thByPlayer.set(a.attackerTag, a.attackerTH);
      if (a.defenderTH > 0) thByPlayer.set(a.defenderTag, a.defenderTH);
    }
    const thCount = new Map<number, number>();
    for (const th of thByPlayer.values())
      thCount.set(th, (thCount.get(th) ?? 0) + 1);

    const stars = [0, 0, 0, 0];
    const starsReg = [0, 0, 0, 0];
    const starsCwl = [0, 0, 0, 0];
    const destr = new Array(10).fill(0) as number[];
    const dur = new Array(6).fill(0) as number[]; // 0:00–3:00 in 30s buckets
    const diffAgg = new Map<number, { sum: number; n: number }>();

    for (const a of attacks) {
      const s = Math.min(3, Math.max(0, a.stars));
      stars[s]++;
      if (a.war.type === "cwl") starsCwl[s]++;
      else starsReg[s]++;
      destr[Math.min(9, Math.floor(a.destruction / 10))]++;
      if (a.duration != null)
        dur[Math.min(5, Math.floor(a.duration / 30))]++;
      const diff = a.defenderTH - a.attackerTH;
      if (a.attackerTH > 0 && a.defenderTH > 0 && Math.abs(diff) <= 5) {
        const d = diffAgg.get(diff) ?? { sum: 0, n: 0 };
        d.sum += a.stars;
        d.n++;
        diffAgg.set(diff, d);
      }
    }

    const fmtDur = (i: number) =>
      `${Math.floor((i * 30) / 60)}:${String((i * 30) % 60).padStart(2, "0")}-${Math.floor(((i + 1) * 30) / 60)}:${String(((i + 1) * 30) % 60).padStart(2, "0")}`;

    return {
      wars,
      attacks: attacks.length,
      playersTracked: thByPlayer.size,
      thDist: [...thCount.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([th, count]) => ({ th, count })),
      starsDist: stars.map((count, s) => ({ stars: s, count })),
      destructionDist: destr.map((count, i) => ({
        bucket: `${i * 10}-${i * 10 + 10}`,
        count,
      })),
      durationDist: dur.map((count, i) => ({ bucket: fmtDur(i), count })),
      thDiffStars: [...diffAgg.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([thDiff, d]) => ({
          thDiff,
          avgStars: d.sum / d.n,
          count: d.n,
        })),
      regular: {
        starsDist: starsReg.map((count, s) => ({ stars: s, count })),
      },
      cwl: { starsDist: starsCwl.map((count, s) => ({ stars: s, count })) },
    };
  });
}

export async function getGlobalStats(locationId?: number): Promise<GlobalStats> {
  const loc = locationId ?? GLOBAL_LOCATION_ID;
  return cached(`coc:global:${loc}`, TTL, async () => {
    const settled = await Promise.allSettled([
      getLocations(),
      api.rankedPlayers(loc, 200),
      api.rankedClans(loc, 200),
      api.rankedPlayersBB(loc, 50),
      api.rankedClansBB(loc, 50),
      api.rankedCapitals(loc, 50),
      api.leagues(),
      api.warLeagues(),
      api.capitalLeagues(),
      api.builderBaseLeagues(),
      api.legendSeasons(),
    ]);
    const val = <T,>(i: number, fallback: T): T =>
      settled[i].status === "fulfilled"
        ? (settled[i] as PromiseFulfilledResult<T>).value
        : fallback;

    const locations = val(0, [] as CocLocation[]);
    const players = val(1, { items: [] as CocRankedPlayer[] }).items;
    const clans = val(2, { items: [] as CocRankedClan[] }).items;
    const bbPlayers = val(3, { items: [] as CocRankedBBPlayer[] }).items;
    const bbClans = val(4, { items: [] as CocRankedClan[] }).items;
    const capitals = val(5, { items: [] as CocRankedClan[] }).items;
    const home = val(6, { items: [] as CocLeague[] }).items;
    const war = val(7, { items: [] as { id: number; name: string }[] }).items;
    const capital = val(8, { items: [] as { id: number; name: string }[] })
      .items;
    const builderBase = val(9, { items: [] as CocLeague[] }).items;
    const seasons = val(10, { items: [] as { id: string }[] }).items;

    // Legend league: latest season's top players (global only — the endpoint
    // is not location-scoped, so it's the same regardless of picker).
    let legend: GlobalStats["legend"] = { season: null, players: [] };
    const season = seasons.map((s) => s.id).sort().pop() ?? null;
    if (season) {
      try {
        legend = {
          season,
          players: (await api.legendSeason(season, 50)).items,
        };
      } catch {
        // season list exists but rankings not open yet — leave empty
      }
    }

    const locName =
      locations.find((l) => l.id === loc)?.name ??
      (loc === GLOBAL_LOCATION_ID ? "Global" : `#${loc}`);

    return {
      location: { id: loc, name: locName },
      locations,
      players,
      clans,
      bbPlayers,
      bbClans,
      capitals,
      legend,
      leagues: { home, war, capital, builderBase },
      warStats: await getWarStats(),
      fetchedAt: new Date().toISOString(),
    };
  });
}
