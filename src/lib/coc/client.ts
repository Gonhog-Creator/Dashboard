/**
 * Thin client for the official Clash of Clans API.
 *
 * Auth: JWT key from https://developer.clashofclans.com — keys are bound to
 * whitelisted IPs. If the home IP rotates, either re-issue the key or set
 * COC_API_BASE=https://proxy.royaleapi.dev/v1 and whitelist 45.79.218.79.
 *
 * Config resolution order: Setting table (via /settings) → env vars.
 *   COC_API_KEY / coc.apiKey   — required
 *   COC_CLAN_TAG / coc.clanTag — your clan ("#2PP" or "2PP")
 *   COC_PLAYER_TAG / coc.playerTag — your account
 *   COC_API_BASE — optional override (proxy)
 */

import { getSetting } from "@/lib/settings";

const DEFAULT_BASE = "https://api.clashofclans.com/v1";

export class CocApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "CocApiError";
  }
}

export function normalizeTag(tag: string): string {
  const t = tag.trim().toUpperCase();
  return t.startsWith("#") ? t : `#${t}`;
}

export async function cocConfig() {
  const [key, clanTag, playerTag] = await Promise.all([
    getSetting("coc.apiKey"),
    getSetting("coc.clanTag"),
    getSetting("coc.playerTag"),
  ]);
  return {
    apiKey: key || process.env.COC_API_KEY || "",
    clanTag: clanTag || process.env.COC_CLAN_TAG || "",
    playerTag: playerTag || process.env.COC_PLAYER_TAG || "",
    baseUrl: process.env.COC_API_BASE || DEFAULT_BASE,
  };
}

export async function cocFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const { apiKey, baseUrl } = await cocConfig();
  if (!apiKey) throw new CocApiError(0, "CoC API key not configured");
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 403 with invalidIp usually means the key's whitelist is stale.
    throw new CocApiError(res.status, `CoC API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** CoC timestamps look like "20260920T130000.000Z". */
export function parseCocTime(s?: string | null): Date | null {
  if (!s) return null;
  const m = s.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, sec, ms] = m;
  return new Date(
    Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec, +ms)
  );
}

// ---------- API response types (subset we use) ----------

export interface CocClanMember {
  tag: string;
  name: string;
  role: string;
  townHallLevel: number;
  expLevel: number;
  leagueTier?: { name: string; iconUrls?: { small?: string; medium?: string } };
  trophies: number;
  donations: number;
  donationsReceived: number;
  clanRank: number;
  previousClanRank?: number;
  warPreference?: string; // "in" | "out"
}

export interface CocClan {
  tag: string;
  name: string;
  clanLevel: number;
  clanPoints: number;
  clanCapitalPoints?: number;
  warWins?: number;
  warWinStreak?: number;
  warLeague?: { name: string };
  capitalLeague?: { name: string };
  members: number;
  memberList: CocClanMember[];
  clanCapital?: { capitalHallLevel?: number };
  isWarLogPublic?: boolean;
  isFamilyFriendly?: boolean;
  warFrequency?: string;
  description?: string;
  badgeUrls?: { medium?: string; large?: string };
  clanBuilderBasePoints?: number;
  location?: { name?: string };
  labels?: { name: string }[];
  chatLanguage?: { name?: string };
  requiredTrophies?: number;
  requiredTownhallLevel?: number;
}

export interface CocWarMember {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacks?: {
    order: number;
    attackerTag: string;
    defenderTag: string;
    stars: number;
    destructionPercentage: number;
    duration?: number;
  }[];
  opponentAttacks?: number;
  bestOpponentAttack?: {
    order: number;
    attackerTag: string;
    defenderTag: string;
    stars: number;
    destructionPercentage: number;
  };
}

export interface CocWarSide {
  tag?: string;
  name?: string;
  clanLevel?: number;
  badgeUrls?: { small?: string; medium?: string; large?: string };
  stars: number;
  destructionPercentage: number;
  attacks?: number;
  members: CocWarMember[];
}

export interface CocCurrentWar {
  state: string;
  teamSize: number;
  attacksPerMember?: number;
  preparationStartTime?: string;
  startTime?: string;
  endTime?: string;
  clan: CocWarSide;
  opponent: CocWarSide;
}

export interface CocWarLogEntry {
  result?: string;
  endTime?: string;
  teamSize: number;
  attacksPerMember?: number;
  clan: { tag?: string; name?: string; badgeUrls?: { medium?: string }; stars: number; destructionPercentage: number; attacks?: number; expEarned?: number };
  opponent: { tag?: string; name?: string; clanLevel?: number; badgeUrls?: { medium?: string }; stars: number; destructionPercentage: number; attacks?: number };
}

export interface CocLeagueGroup {
  tag?: string;
  state: string;
  season: string;
  clans: { tag: string; name: string; clanLevel: number; members: { tag: string; name: string; townHallLevel: number }[] }[];
  rounds: { warTags: string[] }[];
}

export interface CocRaidSeason {
  state?: string;
  startTime?: string;
  endTime?: string;
  capitalTotalLoot: number;
  raidsCompleted: number;
  totalAttacks: number;
  enemyDistrictsDestroyed: number;
  offensiveReward: number;
  defensiveReward: number;
  members?: {
    tag: string;
    name: string;
    attacks: number;
    attackLimit: number;
    bonusAttackLimit: number;
    capitalResourcesLooted: number;
  }[];
  attackLog?: CocRaidLogClan[];
  defenseLog?: CocRaidLogClan[];
}

/** One clan's district log inside a raid season (attack or defense side). */
export interface CocRaidLogClan {
  defender?: { tag: string; name?: string; districtHallLevel?: number };
  attacker?: { tag: string; name?: string };
  districts?: {
    id: number;
    name: string;
    districtHallLevel: number;
    destructionPercent: number;
    attackCount: number;
    totalLooted: number;
  }[];
}

export interface CocPlayerData {
  tag: string;
  name: string;
  townHallLevel: number;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  attackWins: number;
  defenseWins: number;
  versusBattleWins?: number;
  warStars?: number;
  donations: number;
  donationsReceived: number;
  clanCapitalContributions?: number;
  builderHallLevel?: number;
  leagueTier?: { name: string; iconUrls?: { small?: string; medium?: string } };
  legendStatistics?: {
    legendTrophies?: number;
    currentSeason?: { trophies: number };
    previousSeason?: { trophies: number; rank?: number };
    bestSeason?: { trophies: number; rank?: number };
  };
  heroes?: { name: string; level: number; maxLevel: number; village: string }[];
  heroEquipment?: { name: string; level: number; maxLevel: number; village: string }[];
  troops?: { name: string; level: number; maxLevel: number; village: string }[];
  spells?: { name: string; level: number; maxLevel: number; village: string }[];
  pets?: { name: string; level: number; maxLevel: number; village: string }[];
  clan?: { tag: string; name: string };
  role?: string;
  builderBaseTrophies?: number;
  builderBaseLeague?: { name: string };
  achievements?: {
    name: string;
    stars: number;
    value: number;
    target: number;
    village: string;
  }[];
  playerHouse?: { elements?: { type: string; id: number }[] };
  labels?: { name: string }[];
}

// ---------- Global rankings / leagues ----------

export interface CocLocation {
  id: number;
  name: string;
  isCountry: boolean;
  countryCode?: string;
}

export interface CocRankedPlayer {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  attackWins?: number;
  defenseWins?: number;
  rank: number;
  previousRank?: number;
  clan?: { tag: string; name: string; badgeUrls?: { small?: string } };
  league?: { id: number; name: string; iconUrls?: { small?: string } };
}

export interface CocRankedClan {
  tag: string;
  name: string;
  clanLevel: number;
  clanPoints?: number;
  clanBuilderBasePoints?: number;
  clanCapitalPoints?: number;
  capitalPoints?: number;
  members?: number;
  rank: number;
  previousRank?: number;
  badgeUrls?: { small?: string; medium?: string };
  location?: { id: number; name: string };
}

export interface CocRankedBBPlayer {
  tag: string;
  name: string;
  expLevel: number;
  builderBaseTrophies: number;
  builderBaseBattleWins?: number;
  rank: number;
  previousRank?: number;
  clan?: { tag: string; name: string };
  builderBaseLeague?: { id: number; name: string };
}

export interface CocLeague {
  id: number;
  name: string;
  iconUrls?: { small?: string; tiny?: string; medium?: string };
}

export interface CocLegendEntry {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  attackWins: number;
  defenseWins: number;
  rank: number;
  clan?: { tag: string; name: string };
}

// ---------- Endpoint helpers ----------

const enc = (tag: string) => encodeURIComponent(normalizeTag(tag));

export const LEGEND_LEAGUE_ID = 29000022;
export const GLOBAL_LOCATION_ID = 32000000;

export const api = {
  clan: (tag: string) => cocFetch<CocClan>(`/clans/${enc(tag)}`),
  currentWar: (tag: string) =>
    cocFetch<CocCurrentWar>(`/clans/${enc(tag)}/currentwar`),
  warLog: (tag: string) =>
    cocFetch<{ items: CocWarLogEntry[] }>(`/clans/${enc(tag)}/warlog`),
  leagueGroup: (tag: string) =>
    cocFetch<CocLeagueGroup>(`/clans/${enc(tag)}/currentwar/leaguegroup`),
  cwlWar: (warTag: string) =>
    cocFetch<CocCurrentWar>(`/clanwarleagues/wars/${enc(warTag)}`),
  raidSeasons: (tag: string, limit = 8) =>
    cocFetch<{ items: CocRaidSeason[] }>(
      `/clans/${enc(tag)}/capitalraidseasons?limit=${limit}`
    ),
  player: (tag: string) => cocFetch<CocPlayerData>(`/players/${enc(tag)}`),
  battleLog: (tag: string, limit = 30) =>
    cocFetch<{ items: Record<string, unknown>[] }>(
      `/players/${enc(tag)}/battlelog?limit=${limit}`
    ),
  goldPass: () =>
    cocFetch<{ startTime?: string; endTime?: string }>(
      `/goldpass/seasons/current`
    ),
  verifyToken: (tag: string, token: string) =>
    cocFetch<{ status: string }>(`/players/${enc(tag)}/verifytoken`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  // Global statistics (ClashSpot-style leaderboards).
  locations: () => cocFetch<{ items: CocLocation[] }>(`/locations`),
  rankedPlayers: (loc: number, limit = 50) =>
    cocFetch<{ items: CocRankedPlayer[] }>(
      `/locations/${loc}/rankings/players?limit=${limit}`
    ),
  rankedClans: (loc: number, limit = 50) =>
    cocFetch<{ items: CocRankedClan[] }>(
      `/locations/${loc}/rankings/clans?limit=${limit}`
    ),
  rankedPlayersBB: (loc: number, limit = 25) =>
    cocFetch<{ items: CocRankedBBPlayer[] }>(
      `/locations/${loc}/rankings/players-builder-base?limit=${limit}`
    ),
  rankedClansBB: (loc: number, limit = 25) =>
    cocFetch<{ items: CocRankedClan[] }>(
      `/locations/${loc}/rankings/clans-builder-base?limit=${limit}`
    ),
  rankedCapitals: (loc: number, limit = 25) =>
    cocFetch<{ items: CocRankedClan[] }>(
      `/locations/${loc}/rankings/capitals?limit=${limit}`
    ),
  leagues: () => cocFetch<{ items: CocLeague[] }>(`/leagues`),
  warLeagues: () =>
    cocFetch<{ items: { id: number; name: string }[] }>(`/warleagues`),
  capitalLeagues: () =>
    cocFetch<{ items: { id: number; name: string }[] }>(`/capitalleagues`),
  builderBaseLeagues: () =>
    cocFetch<{ items: CocLeague[] }>(`/builderbaseleagues`),
  legendSeasons: () =>
    cocFetch<{ items: { id: string }[] }>(
      `/leagues/${LEGEND_LEAGUE_ID}/seasons`
    ),
  legendSeason: (seasonId: string, limit = 50) =>
    cocFetch<{ items: CocLegendEntry[] }>(
      `/leagues/${LEGEND_LEAGUE_ID}/seasons/${seasonId}?limit=${limit}`
    ),
};
