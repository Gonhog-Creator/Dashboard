/**
 * Read-side aggregations for the /coc page and dashboard widget.
 * Everything here is DB-first (populated by the sync jobs) with a live
 * currentwar fetch layered on top so the war board is always fresh.
 */

import { prisma, ensureWal } from "@/lib/db";
import { cached } from "@/lib/cache";
import { getSetting } from "@/lib/settings";
import { api, cocConfig, normalizeTag, parseCocTime } from "./client";
import { iconUrl, parseVillage } from "./village";
import { pollClan } from "./sync";

export interface CocOverview {
  configured: boolean;
  clan: {
    tag: string;
    name: string;
    level: number;
    members: number;
    points: number;
    warWins: number;
    warWinStreak: number;
    warLeague: string | null;
    capitalLeague: string | null;
    badge: string | null;
    capitalPoints: number;
    capitalHallLevel: number | null;
    builderBasePoints: number;
    warFrequency: string | null;
    location: string | null;
    description: string | null;
  } | null;
  war: {
    state: string;
    opponent: string | null;
    teamSize: number;
    clanStars: number;
    opponentStars: number;
    clanDestruction: number;
    opponentDestruction: number;
    attacksUsed: number;
    attacksTotal: number;
    attacksLeft: string[]; // member names with unused attacks (live war only)
    /** Our best hit: name = attacker, vs = defender. */
    bestAttack: {
      name: string;
      vs: string;
      stars: number;
      destruction: number;
    } | null;
    /** Our best hold: name = our defender, vs = enemy attacker. */
    bestDefense: {
      name: string;
      vs: string;
      stars: number;
      destruction: number;
    } | null;
    endTime: string | null;
    startTime: string | null;
  } | null;
  me: {
    tag: string;
    name: string;
    townHall: number;
    expLevel: number;
    thIcon: string | null;
    trophies: number;
    legendTrophies: number | null;
    league: string | null;
    warStars: number;
    /** In-progress upgrades from the village export (finishAt in the future). */
    upgrades: {
      name: string;
      icon: string | null;
      toLevel: number;
      finishAt: string;
    }[];
  } | null;
  pulse: {
    mostActive: { name: string; value: number } | null;
    topDonator: { name: string; value: number } | null;
    trophyClimber: { name: string; value: number } | null;
    capitalMvp: { name: string; value: number } | null;
    warMvp: { name: string; stars: number; destruction: number; opponent: string | null } | null;
    /** Level-ups detected between the last two daily snapshots, clan-wide. */
    upgrades: { name: string; value: number; total: number } | null;
  };
  lastPollAt: string | null;
  /** Gold pass season window (live fetch, cached with the overview). */
  season: { startTime: string | null; endTime: string | null } | null;
}

const LEVEL_FIELDS = [
  "heroes",
  "heroEquipment",
  "troops",
  "spells",
  "pets",
] as const;

type LevelSnapshot = Record<(typeof LEVEL_FIELDS)[number], string | null>;

/**
 * Level-ups between two snapshots across heroes/equipment/troops/spells/pets.
 * The API never exposes in-progress upgrades — only completed level gains.
 */
function countLevelUps(prev: LevelSnapshot, cur: LevelSnapshot): number {
  let n = 0;
  for (const f of LEVEL_FIELDS) {
    if (!cur[f]) continue;
    try {
      const curItems = JSON.parse(cur[f]) as { name: string; level: number }[];
      const prevItems = prev[f]
        ? (JSON.parse(prev[f]) as { name: string; level: number }[])
        : [];
      const prevByName = new Map(prevItems.map((i) => [i.name, i.level]));
      for (const i of curItems) {
        const old = prevByName.get(i.name) ?? 0;
        if (i.level > old) n += i.level - old;
      }
    } catch {
      // malformed JSON — skip field
    }
  }
  return n;
}

export function getOverview(): Promise<CocOverview> {
  return cached("coc:overview", 60_000, getOverviewUncached);
}

async function getOverviewUncached(): Promise<CocOverview> {
  await ensureWal();
  const cfg = await cocConfig();
  const emptyPulse = {
    mostActive: null,
    topDonator: null,
    trophyClimber: null,
    capitalMvp: null,
    warMvp: null,
    upgrades: null,
  };
  if (!cfg.clanTag)
    return {
      configured: false,
      clan: null,
      war: null,
      me: null,
      pulse: emptyPulse,
      lastPollAt: null,
      season: null,
    };

  const clanTag = normalizeTag(cfg.clanTag);

  // Live clan card (cheap, one request) — fall back to latest snapshot.
  let clan: CocOverview["clan"] = null;
  try {
    const c = await api.clan(clanTag);
    clan = {
      tag: c.tag,
      name: c.name,
      level: c.clanLevel,
      members: c.members,
      points: c.clanPoints,
      warWins: c.warWins ?? 0,
      warWinStreak: c.warWinStreak ?? 0,
      warLeague: c.warLeague?.name ?? null,
      capitalLeague: c.capitalLeague?.name ?? null,
      badge: c.badgeUrls?.medium ?? null,
      capitalPoints: c.clanCapitalPoints ?? 0,
      capitalHallLevel: c.clanCapital?.capitalHallLevel ?? null,
      builderBasePoints: c.clanBuilderBasePoints ?? 0,
      warFrequency: c.warFrequency ?? null,
      location: c.location?.name ?? null,
      description: c.description ?? null,
    };
  } catch {
    const snap = await prisma.cocClanSnapshot.findFirst({
      orderBy: { ts: "desc" },
    });
    if (snap) {
      clan = {
        tag: clanTag,
        name: "clan",
        level: snap.clanLevel,
        members: snap.members,
        points: snap.clanPoints,
        warWins: snap.warWins,
        warWinStreak: snap.warWinStreak,
        warLeague: snap.warLeague,
        capitalLeague: snap.capitalLeague,
        badge: null,
        capitalPoints: snap.capitalPoints,
        capitalHallLevel: snap.capitalHallLevel,
        builderBasePoints: snap.builderBasePoints,
        warFrequency: snap.warFrequency,
        location: snap.location,
        description: snap.description,
      };
    }
  }

  // War: prefer the freshest stored row; overlay live state when active.
  const storedWar = await prisma.cocWar.findFirst({
    orderBy: { updatedAt: "desc" },
    include: { attacks: true },
  });
  let war: CocOverview["war"] = null;
  try {
    const live = await api.currentWar(clanTag);
    if (live.state !== "notInWar") {
      const used =
        live.clan.members?.reduce((n, m) => n + (m.attacks?.length ?? 0), 0) ??
        0;
      const apm = live.attacksPerMember ?? 1;
      const oppName = new Map(
        (live.opponent?.members ?? []).map((m) => [m.tag, m.name])
      );
      // Our best hit: most stars, then most destruction.
      let bestAttack: {
        name: string;
        vs: string;
        stars: number;
        destruction: number;
      } | null = null;
      // Our best hold: enemy hit that earned the least.
      let bestDefense: {
        name: string;
        vs: string;
        stars: number;
        destruction: number;
      } | null = null;
      for (const m of live.clan.members ?? []) {
        for (const a of m.attacks ?? []) {
          if (
            !bestAttack ||
            a.stars > bestAttack.stars ||
            (a.stars === bestAttack.stars &&
              a.destructionPercentage > bestAttack.destruction)
          )
            bestAttack = {
              name: m.name,
              vs: oppName.get(a.defenderTag) ?? "?",
              stars: a.stars,
              destruction: a.destructionPercentage,
            };
        }
        const d = m.bestOpponentAttack;
        if (
          d &&
          (!bestDefense ||
            d.stars < bestDefense.stars ||
            (d.stars === bestDefense.stars &&
              d.destructionPercentage < bestDefense.destruction))
        )
          bestDefense = {
            name: m.name,
            vs: oppName.get(d.attackerTag) ?? "?",
            stars: d.stars,
            destruction: d.destructionPercentage,
          };
      }
      war = {
        state: live.state,
        opponent: live.opponent?.name ?? null,
        teamSize: live.teamSize,
        clanStars: live.clan.stars,
        opponentStars: live.opponent.stars,
        clanDestruction: live.clan.destructionPercentage,
        opponentDestruction: live.opponent.destructionPercentage,
        attacksUsed: used,
        attacksTotal: live.teamSize * apm,
        attacksLeft:
          live.state === "inWar"
            ? (live.clan.members ?? [])
                .filter((m) => (m.attacks?.length ?? 0) < apm)
                .map((m) => m.name)
            : [],
        bestAttack,
        bestDefense,
        endTime: parseCocTime(live.endTime)?.toISOString() ?? null,
        startTime: parseCocTime(live.startTime)?.toISOString() ?? null,
      };
    }
  } catch {
    // private war log or API down — use stored
  }
  if (!war && storedWar && storedWar.state !== "notInWar") {
    const ours = storedWar.attacks.filter((a) => a.isClanSide);
    const theirs = storedWar.attacks.filter((a) => !a.isClanSide);
    const bestAttack =
      ours.length > 0
        ? ours.reduce((b, a) =>
            a.stars > b.stars ||
            (a.stars === b.stars && a.destruction > b.destruction)
              ? a
              : b
          )
        : null;
    const bestDefense =
      theirs.length > 0
        ? theirs.reduce((b, a) =>
            a.stars < b.stars ||
            (a.stars === b.stars && a.destruction < b.destruction)
              ? a
              : b
          )
        : null;
    war = {
      state: storedWar.state,
      opponent: storedWar.opponentName,
      teamSize: storedWar.teamSize,
      clanStars: storedWar.clanStars,
      opponentStars: storedWar.opponentStars,
      clanDestruction: storedWar.clanDestruction,
      opponentDestruction: storedWar.opponentDestruction,
      attacksUsed: ours.length,
      attacksTotal: storedWar.teamSize * storedWar.attacksPerMember,
      attacksLeft: [],
      bestAttack: bestAttack
        ? {
            name: bestAttack.attackerName,
            vs: bestAttack.defenderName,
            stars: bestAttack.stars,
            destruction: bestAttack.destruction,
          }
        : null,
      bestDefense: bestDefense
        ? {
            name: bestDefense.defenderName,
            vs: bestDefense.attackerName,
            stars: bestDefense.stars,
            destruction: bestDefense.destruction,
          }
        : null,
      endTime: storedWar.endTime?.toISOString() ?? null,
      startTime: storedWar.startTime?.toISOString() ?? null,
    };
  }

  // Me: latest snapshot of the configured player.
  let me: CocOverview["me"] = null;
  if (cfg.playerTag) {
    const snap = await prisma.cocPlayerSnapshot.findFirst({
      where: { playerTag: normalizeTag(cfg.playerTag) },
      orderBy: { ts: "desc" },
      include: { player: true },
    });
    if (snap) {
      me = {
        tag: snap.playerTag,
        name: snap.player.name,
        townHall: snap.townHall,
        expLevel: snap.expLevel,
        thIcon: iconUrl("building", "Town Hall", snap.townHall),
        trophies: snap.trophies,
        legendTrophies: snap.legendTrophies,
        league: snap.leagueName,
        warStars: snap.warStars,
        upgrades: [],
      };
    }
    // In-progress upgrades come from the manual village export (settings).
    const villageRaw = await getSetting("coc.villageJson");
    if (me && villageRaw) {
      try {
        const now = Date.now();
        me.upgrades = parseVillage(villageRaw).upgrades.filter(
          (u) => Date.parse(u.finishAt) > now
        );
      } catch {
        // stale/malformed export — ignore
      }
    }
  }

  // --- Clan pulse: leader highlights ---
  const pulse: CocOverview["pulse"] = { ...emptyPulse };

  // 24h deltas: newest two snapshots per in-clan member (3d window covers gaps).
  const recent = await prisma.cocPlayerSnapshot.findMany({
    where: {
      ts: { gte: new Date(Date.now() - 3 * 86400_000) },
      player: { inClan: true },
    },
    orderBy: { ts: "desc" },
    include: { player: { select: { name: true } } },
  });
  const byTag = new Map<string, typeof recent>();
  for (const s of recent) {
    const l = byTag.get(s.playerTag) ?? [];
    if (l.length < 2) l.push(s);
    byTag.set(s.playerTag, l);
  }
  let upgradesTotal = 0;
  let topUpgrader: { name: string; value: number } | null = null;
  for (const snaps of byTag.values()) {
    if (snaps.length < 2) continue;
    const [cur, prev] = snaps;
    const acts = cur.attackWins - prev.attackWins;
    const dons = cur.donations - prev.donations;
    const trophe = cur.trophies - prev.trophies;
    if (acts > 0 && acts > (pulse.mostActive?.value ?? 0))
      pulse.mostActive = { name: cur.player.name, value: acts };
    if (dons > 0 && dons > (pulse.topDonator?.value ?? 0))
      pulse.topDonator = { name: cur.player.name, value: dons };
    if (trophe > 0 && trophe > (pulse.trophyClimber?.value ?? 0))
      pulse.trophyClimber = { name: cur.player.name, value: trophe };
    const ups = countLevelUps(prev, cur);
    if (ups > 0) {
      upgradesTotal += ups;
      if (ups > (topUpgrader?.value ?? 0))
        topUpgrader = { name: cur.player.name, value: ups };
    }
  }
  if (upgradesTotal > 0 && topUpgrader)
    pulse.upgrades = { ...topUpgrader, total: upgradesTotal };

  // Last war MVP: most stars (tiebreak destruction) in the latest war with attacks.
  const lastWar = await prisma.cocWar.findFirst({
    where: { attacks: { some: { isClanSide: true } } },
    orderBy: [{ startTime: "desc" }, { updatedAt: "desc" }],
    include: { attacks: { where: { isClanSide: true } } },
  });
  if (lastWar) {
    const per = new Map<string, { name: string; stars: number; destr: number }>();
    for (const a of lastWar.attacks) {
      const p = per.get(a.attackerTag) ?? {
        name: a.attackerName,
        stars: 0,
        destr: 0,
      };
      p.stars += a.stars;
      p.destr += a.destruction;
      per.set(a.attackerTag, p);
    }
    const best = [...per.values()].sort(
      (a, b) => b.stars - a.stars || b.destr - a.destr
    )[0];
    if (best)
      pulse.warMvp = {
        name: best.name,
        stars: best.stars,
        destruction: best.destr,
        opponent: lastWar.opponentName,
      };
  }

  // Capital MVP: top looter in the latest raid weekend.
  const raid = await prisma.cocRaidSeason.findFirst({
    orderBy: { startTime: "desc" },
    select: { members: true },
  });
  if (raid?.members) {
    try {
      const ms = JSON.parse(raid.members) as {
        name: string;
        capitalResourcesLooted: number;
      }[];
      const top = ms.sort(
        (a, b) => b.capitalResourcesLooted - a.capitalResourcesLooted
      )[0];
      if (top)
        pulse.capitalMvp = { name: top.name, value: top.capitalResourcesLooted };
    } catch {
      // malformed JSON — skip
    }
  }

  const lastPoll = await prisma.cocClanSnapshot.findFirst({
    orderBy: { ts: "desc" },
    select: { ts: true },
  });

  // Gold pass season window — cheap live call, cached with the overview.
  let season: CocOverview["season"] = null;
  try {
    const gp = await api.goldPass();
    season = {
      startTime: parseCocTime(gp.startTime)?.toISOString() ?? null,
      endTime: parseCocTime(gp.endTime)?.toISOString() ?? null,
    };
  } catch {
    // endpoint unavailable — skip
  }

  return {
    configured: true,
    clan,
    war,
    me,
    pulse,
    lastPollAt: lastPoll?.ts.toISOString() ?? null,
    season,
  };
}

/** Widget payload — small subset of overview. */
export async function getWidgetData() {
  const o = await getOverview();
  return {
    configured: o.configured,
    clanName: o.clan?.name ?? null,
    war: o.war
      ? {
          state: o.war.state,
          opponent: o.war.opponent,
          clanStars: o.war.clanStars,
          opponentStars: o.war.opponentStars,
          attacksUsed: o.war.attacksUsed,
          attacksTotal: o.war.attacksTotal,
          endTime: o.war.endTime,
        }
      : null,
    me: o.me
      ? { trophies: o.me.trophies, legendTrophies: o.me.legendTrophies, league: o.me.league }
      : null,
    lastPollAt: o.lastPollAt,
  };
}

/** Members tab: current roster + latest snapshot + 30d deltas. */
export async function getMembers() {
  await ensureWal();
  const players = await prisma.cocPlayer.findMany({
    where: { inClan: true },
    orderBy: { townHall: "desc" },
  });
  const since = new Date(Date.now() - 30 * 86400_000);

  const rows = await Promise.all(
    players.map(async (p) => {
      const [latest, monthAgo] = await Promise.all([
        prisma.cocPlayerSnapshot.findFirst({
          where: { playerTag: p.tag },
          orderBy: { ts: "desc" },
        }),
        prisma.cocPlayerSnapshot.findFirst({
          where: { playerTag: p.tag, ts: { lte: since } },
          orderBy: { ts: "desc" },
        }),
      ]);
      return {
        tag: p.tag,
        name: p.name,
        role: p.role,
        warPreference: p.warPreference,
        townHall: p.townHall,
        isMe: p.isMe,
        // Live member-list values (refreshed every poll, no snapshot lag).
        clanRank: p.clanRank,
        previousClanRank: p.previousClanRank,
        liveDonations: p.donations,
        liveDonationsReceived: p.donationsReceived,
        trophies: latest?.trophies ?? null,
        league: latest?.leagueName ?? null,
        donations: latest?.donations ?? null,
        donationsReceived: latest?.donationsReceived ?? null,
        capitalContributions: latest?.clanCapitalContributions ?? null,
        expLevel: latest?.expLevel ?? null,
        warStars: latest?.warStars ?? null,
        legendTrophies: latest?.legendTrophies ?? null,
        delta30d:
          latest && monthAgo
            ? {
                trophies: latest.trophies - monthAgo.trophies,
                donations: latest.donations - monthAgo.donations,
                warStars: latest.warStars - monthAgo.warStars,
                expLevel: latest.expLevel - monthAgo.expLevel,
              }
            : null,
        lastSnapshotAt: latest?.ts.toISOString() ?? null,
      };
    })
  );
  return rows;
}

interface LevelEntry {
  name: string;
  level: number;
  maxLevel: number;
}

function sumLevels(json: string | null): number | null {
  if (!json) return null;
  try {
    return (JSON.parse(json) as LevelEntry[]).reduce((s, e) => s + e.level, 0);
  } catch {
    return null;
  }
}

/** Per-player snapshot series for charts — all tracked counters + level sums. */
export async function getPlayerHistory(tag: string, days = 90) {
  await ensureWal();
  const since = new Date(Date.now() - days * 86400_000);
  const snaps = await prisma.cocPlayerSnapshot.findMany({
    where: { playerTag: normalizeTag(tag), ts: { gte: since } },
    orderBy: { ts: "asc" },
  });
  return snaps.map((s) => {
    const ach = achievementMap(s.achievements);
    return {
      ts: s.ts.toISOString(),
      townHall: s.townHall,
      expLevel: s.expLevel,
      trophies: s.trophies,
      legendTrophies: s.legendTrophies,
      warStars: s.warStars,
      donations: s.donations,
      donationsReceived: s.donationsReceived,
      capitalContributions: s.clanCapitalContributions,
      attackWins: s.attackWins,
      defenseWins: s.defenseWins,
      builderBaseTrophies: s.builderBaseTrophies,
      versusBattleWins: s.versusBattleWins,
      clanRank: s.clanRank,
      goldGrab: ach.get("Gold Grab") ?? null,
      elixirGrab: ach.get("Elixir Escapade") ?? null,
      darkGrab: ach.get("Heroic Heist") ?? null,
      goblins: ach.get("Get even more Goblins!") ?? null,
      gamesChampion: ach.get("Games Champion") ?? null,
      heroLevels: sumLevels(s.heroes),
      equipmentLevels: sumLevels(s.heroEquipment),
      troopLevels: sumLevels(s.troops),
      spellLevels: sumLevels(s.spells),
      petLevels: sumLevels(s.pets),
    };
  });
}

/** achievement name → value for one snapshot's JSON blob. */
function achievementMap(json: string | null): Map<string, number> {
  const m = new Map<string, number>();
  if (!json) return m;
  try {
    for (const a of JSON.parse(json) as { name: string; value: number }[])
      m.set(a.name, a.value);
  } catch {
    // malformed — skip
  }
  return m;
}

interface SnapRow {
  ts: Date;
  townHall: number;
  builderHall: number | null;
  leagueName: string | null;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  warStars: number;
  donations: number;
  donationsReceived: number;
  attackWins: number;
  defenseWins: number;
  versusBattleWins: number;
  clanRank: number | null;
  heroes: string | null;
  heroEquipment: string | null;
  troops: string | null;
  spells: string | null;
  pets: string | null;
  achievements: string | null;
}

/**
 * Clash-of-Stats-style progress log: diff consecutive snapshots into events
 * (TH/BH upgrades, league changes, item level-ups, achievement stars,
 * counter milestones). Newest first.
 */
export async function getProgressLog(tag: string, days = 180) {
  await ensureWal();
  const since = new Date(Date.now() - days * 86400_000);
  const snaps = (await prisma.cocPlayerSnapshot.findMany({
    where: { playerTag: normalizeTag(tag), ts: { gte: since } },
    orderBy: { ts: "asc" },
  })) as SnapRow[];

  const events: { ts: string; kind: string; text: string }[] = [];
  const push = (ts: Date, kind: string, text: string) =>
    events.push({ ts: ts.toISOString(), kind, text });

  const itemDiffs = (
    prev: string | null,
    cur: string | null,
    ts: Date
  ) => {
    if (!cur) return;
    try {
      const curItems = JSON.parse(cur) as { name: string; level: number }[];
      const prevItems = prev
        ? (JSON.parse(prev) as { name: string; level: number }[])
        : [];
      const prevByName = new Map(prevItems.map((i) => [i.name, i.level]));
      for (const i of curItems) {
        const old = prevByName.get(i.name) ?? 0;
        if (i.level > old)
          push(ts, "upgrade", `${i.name} → level ${i.level}`);
      }
    } catch {
      // malformed — skip
    }
  };

  const milestone = (
    prev: number,
    cur: number,
    step: number,
    ts: Date,
    label: string
  ) => {
    const crossed = Math.floor(cur / step) - Math.floor(prev / step);
    if (crossed > 0)
      push(ts, "milestone", `Reached ${(Math.floor(cur / step) * step).toLocaleString()} ${label}`);
  };

  let bestTrophies = 0;
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1];
    const b = snaps[i];
    const ts = b.ts;

    if (b.townHall > a.townHall)
      push(ts, "townhall", `Upgraded to Town Hall ${b.townHall}`);
    if (b.builderHall != null && b.builderHall > (a.builderHall ?? 0))
      push(ts, "builderhall", `Upgraded to Builder Hall ${b.builderHall}`);
    if (b.leagueName && b.leagueName !== a.leagueName)
      push(ts, "league", `Entered ${b.leagueName}`);

    bestTrophies = Math.max(bestTrophies, a.trophies);
    if (b.trophies > bestTrophies && b.trophies > a.bestTrophies)
      push(ts, "best", `New trophy best: ${b.trophies.toLocaleString()}`);

    milestone(a.warStars, b.warStars, 100, ts, "war stars");
    milestone(a.donations, b.donations, 5000, ts, "donations");
    milestone(a.attackWins, b.attackWins, 250, ts, "attack wins");
    milestone(a.defenseWins, b.defenseWins, 250, ts, "defense wins");
    milestone(a.versusBattleWins, b.versusBattleWins, 100, ts, "versus wins");

    for (const f of ["heroes", "heroEquipment", "troops", "spells", "pets"] as const)
      itemDiffs(a[f], b[f], ts);

    // Achievement star gains.
    if (b.achievements) {
      try {
        const prevA = new Map(
          (a.achievements
            ? (JSON.parse(a.achievements) as { name: string; stars: number }[])
            : []
          ).map((x) => [x.name, x.stars])
        );
        for (const x of JSON.parse(b.achievements) as {
          name: string;
          stars: number;
        }[]) {
          const old = prevA.get(x.name) ?? 0;
          if (x.stars > old) push(ts, "achievement", `${x.name} ★${x.stars}`);
        }
      } catch {
        // malformed — skip
      }
    }
  }

  return events.reverse().slice(0, 200);
}

/** Per-member war performance aggregated across all captured wars. */
export async function getWarAnalytics() {
  await ensureWal();
  const attacks = await prisma.cocWarAttack.findMany({
    include: {
      war: {
        select: {
          id: true,
          attacksPerMember: true,
          startTime: true,
          opponentName: true,
          type: true,
        },
      },
    },
  });

  interface AttackDetail {
    war: string; // "CWL vs X" or "vs X"
    ts: string | null;
    order: number;
    stars: number;
    destruction: number;
    duration: number | null;
    defenderName: string;
    defenderTH: number;
    thDiff: number; // defenderTH - attackerTH (+ = hit up)
  }

  const byPlayer = new Map<
    string,
    {
      name: string;
      th: number;
      wars: Set<string>;
      attacks: number;
      expected: number;
      stars: number;
      triples: number;
      destruction: number;
      durSum: number;
      durN: number;
      detail: AttackDetail[];
    }
  >();

  // Defense: opponent attacks (isClanSide=false) grouped by our defender.
  const defense = new Map<string, { n: number; stars: number; triples: number }>();

  for (const a of attacks) {
    if (!a.isClanSide) {
      const d = defense.get(a.defenderTag) ?? { n: 0, stars: 0, triples: 0 };
      d.n++;
      d.stars += a.stars;
      if (a.stars === 3) d.triples++;
      defense.set(a.defenderTag, d);
      continue;
    }

    let p = byPlayer.get(a.attackerTag);
    if (!p) {
      p = {
        name: a.attackerName,
        th: a.attackerTH,
        wars: new Set(),
        attacks: 0,
        expected: 0,
        stars: 0,
        triples: 0,
        destruction: 0,
        durSum: 0,
        durN: 0,
        detail: [],
      };
      byPlayer.set(a.attackerTag, p);
    }
    if (!p.wars.has(a.warId)) {
      p.wars.add(a.warId);
      p.expected += a.war.attacksPerMember;
    }
    p.attacks++;
    p.stars += a.stars;
    if (a.stars === 3) p.triples++;
    p.destruction += a.destruction;
    if (a.duration != null) {
      p.durSum += a.duration;
      p.durN++;
    }
    p.detail.push({
      war: `${a.war.type === "cwl" ? "CWL vs" : "vs"} ${a.war.opponentName ?? "?"}`,
      ts: a.war.startTime?.toISOString() ?? null,
      order: a.order,
      stars: a.stars,
      destruction: a.destruction,
      duration: a.duration,
      defenderName: a.defenderName,
      defenderTH: a.defenderTH,
      thDiff: a.defenderTH - a.attackerTH,
    });
  }

  return [...byPlayer.entries()]
    .map(([tag, p]) => {
      const d = defense.get(tag);
      return {
        tag,
        name: p.name,
        townHall: p.th,
        wars: p.wars.size,
        attacks: p.attacks,
        hitRate: p.expected > 0 ? p.attacks / p.expected : null,
        avgStars: p.attacks > 0 ? p.stars / p.attacks : 0,
        tripleRate: p.attacks > 0 ? p.triples / p.attacks : 0,
        avgDestruction: p.attacks > 0 ? p.destruction / p.attacks : 0,
        avgDuration: p.durN > 0 ? p.durSum / p.durN : null,
        defAttacks: d?.n ?? 0,
        defStars: d ? d.stars / d.n : null,
        defTripleRate: d ? d.triples / d.n : null,
        detail: p.detail.sort(
          (a, b) => (a.ts ?? "").localeCompare(b.ts ?? "") || a.order - b.order
        ),
      };
    })
    .sort((a, b) => b.avgStars - a.avgStars || b.attacks - a.attacks);
}

/** Wars tab: stored wars with attack summaries + roster. */
export async function getWars(limit = 30) {
  await ensureWal();
  const wars = await prisma.cocWar.findMany({
    orderBy: [{ startTime: "desc" }, { updatedAt: "desc" }],
    take: limit,
    include: { attacks: true },
  });
  // Fallback roster for wars captured before we stored members.
  const roster = await prisma.cocPlayer.findMany({
    where: { inClan: true },
    select: { tag: true, name: true, townHall: true },
  });
  return wars.map((w) => {
    const ours = w.attacks.filter((a) => a.isClanSide);
    let members: { tag: string; name: string; th: number; pos: number }[] = [];
    if (w.members) {
      try {
        members = JSON.parse(w.members);
      } catch {
        // malformed JSON — fall back below
      }
    }
    if (members.length === 0 && ours.length > 0) {
      // Approximate: current roster + any attackers no longer in clan.
      const seen = new Map<string, { tag: string; name: string; th: number; pos: number }>();
      for (const p of roster)
        seen.set(p.tag, { tag: p.tag, name: p.name, th: p.townHall, pos: 0 });
      for (const a of ours)
        if (!seen.has(a.attackerTag))
          seen.set(a.attackerTag, {
            tag: a.attackerTag,
            name: a.attackerName,
            th: a.attackerTH,
            pos: a.attackerMapPos,
          });
      members = [...seen.values()];
    }
    return {
      id: w.id,
      type: w.type,
      season: w.season,
      state: w.state,
      result: w.result,
      startTime: w.startTime?.toISOString() ?? null,
      endTime: w.endTime?.toISOString() ?? null,
      teamSize: w.teamSize,
      attacksPerMember: w.attacksPerMember,
      opponentName: w.opponentName,
      opponentTag: w.opponentTag,
      clanBadge: w.clanBadge,
      opponentBadge: w.opponentBadge,
      preparationStartTime: w.preparationStartTime?.toISOString() ?? null,
      clanAttacks: w.clanAttacks,
      opponentAttacks: w.opponentAttacks,
      expEarned: w.expEarned,
      opponentMembers: w.opponentMembers
        ? (JSON.parse(w.opponentMembers) as {
            tag: string;
            name: string;
            th: number;
            pos: number;
          }[])
        : [],
      clanStars: w.clanStars,
      opponentStars: w.opponentStars,
      clanDestruction: w.clanDestruction,
      opponentDestruction: w.opponentDestruction,
      members,
      attacks: ours.map((a) => ({
        order: a.order,
        attackerTag: a.attackerTag,
        attackerName: a.attackerName,
        attackerTH: a.attackerTH,
        defenderName: a.defenderName,
        defenderTH: a.defenderTH,
        stars: a.stars,
        destruction: a.destruction,
        duration: a.duration,
      })),
    };
  });
}

/** Capital tab: raid seasons, newest first. */
export async function getRaids(limit = 12) {
  await ensureWal();
  const seasons = await prisma.cocRaidSeason.findMany({
    orderBy: { startTime: "desc" },
    take: limit,
  });
  return seasons.map((s) => ({
    seasonId: s.seasonId,
    state: s.state,
    startTime: s.startTime?.toISOString() ?? null,
    endTime: s.endTime?.toISOString() ?? null,
    capitalTotalLoot: s.capitalTotalLoot,
    raidsCompleted: s.raidsCompleted,
    totalAttacks: s.totalAttacks,
    enemyDistrictsDestroyed: s.enemyDistrictsDestroyed,
    offensiveReward: s.offensiveReward,
    defensiveReward: s.defensiveReward,
    members: s.members ? JSON.parse(s.members) : [],
    attackLog: s.attackLog ? JSON.parse(s.attackLog) : [],
    defenseLog: s.defenseLog ? JSON.parse(s.defenseLog) : [],
  }));
}

/** Me tab: profile + battle log + snapshot series. */
export async function getMe() {
  await ensureWal();
  const cfg = await cocConfig();
  if (!cfg.playerTag) return { configured: false as const };
  const tag = normalizeTag(cfg.playerTag);

  const [player, snaps, battles] = await Promise.all([
    prisma.cocPlayer.findUnique({ where: { tag } }),
    prisma.cocPlayerSnapshot.findMany({
      where: { playerTag: tag },
      orderBy: { ts: "asc" },
      take: 120,
    }),
    prisma.cocBattle.findMany({
      where: { playerTag: tag },
      orderBy: { ts: "desc" },
      take: 40,
    }),
  ]);

  let live = null;
  try {
    const p = await api.player(tag);
    live = {
      name: p.name,
      townHall: p.townHallLevel,
      expLevel: p.expLevel,
      trophies: p.trophies,
      bestTrophies: p.bestTrophies,
      league: p.leagueTier?.name ?? null,
      leagueIcon: p.leagueTier?.iconUrls?.small ?? null,
      legendTrophies: p.legendStatistics?.legendTrophies ?? null,
      warStars: p.warStars ?? 0,
      donations: p.donations,
      heroes: (p.heroes ?? [])
        .filter((h) => h.village === "home")
        .map((h) => ({ name: h.name, level: h.level, maxLevel: h.maxLevel })),
      equipment: (p.heroEquipment ?? [])
        .filter((e) => e.village === "home")
        .map((e) => ({ name: e.name, level: e.level, maxLevel: e.maxLevel })),
    };
  } catch {
    // offline — snapshots still render
  }

  return {
    configured: true as const,
    tag,
    inClan: player?.inClan ?? false,
    live,
    battles: battles.map((b) => ({
      ts: b.ts.toISOString(),
      type: b.type,
      stars: b.stars,
      destruction: b.destruction,
      trophiesDelta: b.trophiesDelta,
      opponentName: b.opponentName,
      opponentTH: b.opponentTH,
      lootGold: b.lootGold,
      lootElixir: b.lootElixir,
      lootDark: b.lootDark,
    })),
    series: snaps.map((s) => ({
      ts: s.ts.toISOString(),
      trophies: s.trophies,
      legendTrophies: s.legendTrophies,
      warStars: s.warStars,
      donations: s.donations,
    })),
  };
}

/** CWL bracket for the latest season — 8 clans + round warTags. */
export async function getCwlSeason() {
  await ensureWal();
  const s = await prisma.cocCwlSeason.findFirst({
    orderBy: { season: "desc" },
  });
  if (!s) return null;
  return {
    season: s.season,
    state: s.state,
    clans: s.clans ? JSON.parse(s.clans) : [],
    rounds: s.rounds ? JSON.parse(s.rounds) : [],
  };
}

/**
 * Config tab: which API surfaces we consume + freshness of each pipeline.
 * `endpoints` is a static registry — update it when adding/removing calls.
 */
export async function getApiStatus() {
  await ensureWal();
  const cfg = await cocConfig();
  const [clanSnap, war, raid, battle, snap, cwl] = await Promise.all([
    prisma.cocClanSnapshot.findFirst({
      orderBy: { ts: "desc" },
      select: { ts: true },
    }),
    prisma.cocWar.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.cocRaidSeason.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.cocBattle.findFirst({
      orderBy: { ts: "desc" },
      select: { ts: true },
    }),
    prisma.cocPlayerSnapshot.findFirst({
      orderBy: { ts: "desc" },
      select: { ts: true },
    }),
    prisma.cocCwlSeason.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const endpoints = [
    { path: "GET /clans/{tag}", used: true, for: "Clan card, roster, live member stats" },
    { path: "GET /clans/{tag}/members", used: false, for: "Redundant — memberList already in /clans" },
    { path: "GET /clans/{tag}/currentwar", used: true, for: "Live war state, rosters, attacks" },
    { path: "GET /clans/{tag}/warlog", used: true, for: "War history backfill (results, badges, XP)" },
    { path: "GET /clans/{tag}/currentwar/leaguegroup", used: true, for: "CWL bracket + round warTags" },
    { path: "GET /clanwarleagues/wars/{warTag}", used: true, for: "CWL round attack detail" },
    { path: "GET /clans/{tag}/capitalraidseasons", used: true, for: "Raid weekends, members, district logs" },
    { path: "GET /players/{tag}", used: true, for: "Daily member snapshots" },
    { path: "GET /players/{tag}/battlelog", used: true, for: "Ranked/legend battles + loot" },
    { path: "POST /players/{tag}/verifytoken", used: false, for: "Verify playerTag ownership (client ready)" },
    { path: "GET /goldpass/seasons/current", used: true, for: "Season countdown" },
    { path: "GET /clans (search)", used: false, for: "Clan search — only useful for a settings picker" },
    { path: "GET /locations/* rankings", used: false, for: "Global/local leaderboards" },
    { path: "GET /leagues, /warleagues, /capitalleagues, /builderbaseleagues", used: false, for: "League metadata + icons" },
    { path: "GET /leagues/{id}/seasons/{seasonId}", used: false, for: "Legend leaderboard" },
    { path: "GET /labels/players, /labels/clans", used: false, for: "Label definitions" },
  ];

  return {
    configured: {
      apiKey: !!cfg.apiKey,
      clanTag: cfg.clanTag || null,
      playerTag: cfg.playerTag || null,
      baseUrl: cfg.baseUrl,
    },
    lastSync: {
      clanPoll: clanSnap?.ts.toISOString() ?? null,
      war: war?.updatedAt.toISOString() ?? null,
      raids: raid?.updatedAt.toISOString() ?? null,
      battleLogs: battle?.ts.toISOString() ?? null,
      memberSnapshots: snap?.ts.toISOString() ?? null,
      cwlGroup: cwl?.updatedAt.toISOString() ?? null,
    },
    endpoints,
  };
}

/** Manual refresh button — runs the poll inline. */
export async function syncNow() {
  const msg = await pollClan();
  return { message: msg };
}
