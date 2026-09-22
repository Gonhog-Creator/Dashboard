/**
 * CoC sync pipeline — the jobs call these. The API is live-state only, so
 * history exists because we capture it here:
 *   - pollClan: clan card + members + current war + CWL rounds (every 15 min)
 *   - snapshotMembers: /players for every member (daily, after 05:00Z reset)
 *   - syncRaids: capital raid seasons (daily)
 *   - syncBattleLogs: /players/{tag}/battlelog for tracked players (hourly)
 */

import { prisma, ensureWal } from "@/lib/db";
import {
  api,
  cocConfig,
  normalizeTag,
  parseCocTime,
  CocApiError,
  type CocCurrentWar,
  type CocWarSide,
} from "./client";

function requireClanTag(cfg: { clanTag: string }) {
  if (!cfg.clanTag) throw new Error("coc.clanTag not configured (Settings)");
  return normalizeTag(cfg.clanTag);
}

// ---------- clan + members + wars ----------

export async function pollClan(): Promise<string> {
  await ensureWal();
  const cfg = await cocConfig();
  const clanTag = requireClanTag(cfg);

  const clan = await api.clan(clanTag);

  // Upsert members; mark departed players inClan=false.
  const seen = new Set<string>();
  for (const m of clan.memberList ?? []) {
    const tag = normalizeTag(m.tag);
    seen.add(tag);
    await prisma.cocPlayer.upsert({
      where: { tag },
      update: {
        name: m.name,
        townHall: m.townHallLevel,
        role: m.role,
        warPreference: m.warPreference ?? null,
        inClan: true,
        lastSeenAt: new Date(),
        trophies: m.trophies ?? 0,
        donations: m.donations ?? 0,
        donationsReceived: m.donationsReceived ?? 0,
        expLevel: m.expLevel ?? 0,
        clanRank: m.clanRank ?? null,
        previousClanRank: m.previousClanRank ?? null,
      },
      create: {
        tag,
        name: m.name,
        townHall: m.townHallLevel,
        role: m.role,
        warPreference: m.warPreference ?? null,
        inClan: true,
        trophies: m.trophies ?? 0,
        donations: m.donations ?? 0,
        donationsReceived: m.donationsReceived ?? 0,
        expLevel: m.expLevel ?? 0,
        clanRank: m.clanRank ?? null,
        previousClanRank: m.previousClanRank ?? null,
      },
    });
  }
  if (seen.size) {
    await prisma.cocPlayer.updateMany({
      where: { inClan: true, tag: { notIn: [...seen] } },
      data: { inClan: false },
    });
  }

  // Mark "me" if configured.
  if (cfg.playerTag) {
    await prisma.cocPlayer.updateMany({
      where: { tag: normalizeTag(cfg.playerTag) },
      data: { isMe: true },
    });
  }

  await prisma.cocClanSnapshot.create({
    data: {
      clanLevel: clan.clanLevel ?? 0,
      clanPoints: clan.clanPoints ?? 0,
      members: clan.members ?? 0,
      warWins: clan.warWins ?? 0,
      warWinStreak: clan.warWinStreak ?? 0,
      warLeague: clan.warLeague?.name ?? null,
      capitalLeague: clan.capitalLeague?.name ?? null,
      capitalHallLevel: clan.clanCapital?.capitalHallLevel ?? null,
      capitalPoints: clan.clanCapitalPoints ?? 0,
      builderBasePoints: clan.clanBuilderBasePoints ?? 0,
      warFrequency: clan.warFrequency ?? null,
      location: clan.location?.name ?? null,
      description: clan.description ?? null,
      isWarLogPublic: clan.isWarLogPublic ?? null,
    },
  });

  let warMsg = "no war";
  try {
    const war = await api.currentWar(clanTag);
    if (war.state !== "notInWar") {
      await captureWar(war, "regular", null, null);
      warMsg = `war ${war.state}`;
    }
  } catch (e) {
    if (!(e instanceof CocApiError && e.status === 403)) throw e;
    warMsg = "war log private";
  }

  // CWL: the league group lists warTags for every round — fetch each so we
  // get full per-attack history for the whole season.
  let cwlMsg = "";
  try {
    const group = await api.leagueGroup(clanTag);
    if (group.state !== "notInWar" && group.rounds?.length) {
      // Persist the 8-clan bracket for standings.
      await prisma.cocCwlSeason.upsert({
        where: { season: group.season },
        update: {
          state: group.state,
          clans: JSON.stringify(
            (group.clans ?? []).map((c) => ({
              tag: c.tag,
              name: c.name,
              level: c.clanLevel,
              members: (c.members ?? []).map((m) => ({
                tag: m.tag,
                name: m.name,
                th: m.townHallLevel,
              })),
            }))
          ),
          rounds: JSON.stringify(
            (group.rounds ?? []).map((r) => r.warTags ?? [])
          ),
        },
        create: {
          season: group.season,
          state: group.state,
          clans: JSON.stringify(
            (group.clans ?? []).map((c) => ({
              tag: c.tag,
              name: c.name,
              level: c.clanLevel,
              members: (c.members ?? []).map((m) => ({
                tag: m.tag,
                name: m.name,
                th: m.townHallLevel,
              })),
            }))
          ),
          rounds: JSON.stringify(
            (group.rounds ?? []).map((r) => r.warTags ?? [])
          ),
        },
      });
      const tags = group.rounds.flatMap((r) => r.warTags ?? []);
      let captured = 0;
      for (const wt of tags) {
        if (!wt || wt === "#0") continue;
        try {
          const w = await api.cwlWar(wt);
          // Only store rounds that involve our clan.
          const ours =
            normalizeTag(w.clan?.tag ?? "") === clanTag ||
            normalizeTag(w.opponent?.tag ?? "") === clanTag;
          if (!ours) continue;
          await captureWar(w, "cwl", group.season, wt);
          captured++;
        } catch {
          // warTag not yet available — fine, next poll gets it
        }
      }
      cwlMsg = `, cwl ${captured}/${tags.length} rounds`;
    }
  } catch (e) {
    if (!(e instanceof CocApiError && (e.status === 404 || e.status === 403)))
      throw e;
  }

  return `clan ${clan.name}: ${seen.size} members, ${warMsg}${cwlMsg}`;
}

/** Upsert a war + its attacks. Works for both regular and CWL payloads. */
export async function captureWar(
  war: CocCurrentWar,
  type: "regular" | "cwl",
  season: string | null,
  warTag: string | null
) {
  const start = parseCocTime(war.startTime);
  const oppTag = war.opponent?.tag ? normalizeTag(war.opponent.tag) : null;

  // Regular wars have no warTag — find by (type, startTime, opponent).
  const existing = warTag
    ? await prisma.cocWar.findUnique({ where: { warTag } })
    : await prisma.cocWar.findFirst({
        where: { type, startTime: start ?? undefined, opponentTag: oppTag },
      });

  const data = {
    type,
    season,
    state: war.state,
    startTime: start,
    endTime: parseCocTime(war.endTime),
    teamSize: war.teamSize ?? 0,
    attacksPerMember: war.attacksPerMember ?? 1,
    opponentTag: oppTag,
    opponentName: war.opponent?.name ?? null,
    opponentLevel: war.opponent?.clanLevel ?? null,
    clanBadge: war.clan?.badgeUrls?.medium ?? null,
    opponentBadge: war.opponent?.badgeUrls?.medium ?? null,
    preparationStartTime: parseCocTime(war.preparationStartTime),
    clanAttacks:
      war.clan?.attacks ??
      (war.clan?.members ?? []).reduce(
        (n, m) => n + (m.attacks?.length ?? 0),
        0
      ),
    opponentAttacks:
      war.opponent?.attacks ??
      (war.opponent?.members ?? []).reduce(
        (n, m) => n + (m.attacks?.length ?? 0),
        0
      ),
    opponentMembers: JSON.stringify(
      (war.opponent?.members ?? []).map((m) => ({
        tag: normalizeTag(m.tag),
        name: m.name,
        th: m.townhallLevel,
        pos: m.mapPosition,
      }))
    ),
    clanStars: war.clan?.stars ?? 0,
    opponentStars: war.opponent?.stars ?? 0,
    clanDestruction: war.clan?.destructionPercentage ?? 0,
    opponentDestruction: war.opponent?.destructionPercentage ?? 0,
    members: JSON.stringify(
      (war.clan?.members ?? []).map((m) => ({
        tag: normalizeTag(m.tag),
        name: m.name,
        th: m.townhallLevel,
        pos: m.mapPosition,
        // Best enemy hit on this member's base (defense outcome).
        bestDef: m.bestOpponentAttack
          ? {
              stars: m.bestOpponentAttack.stars,
              destruction: m.bestOpponentAttack.destructionPercentage,
            }
          : null,
      }))
    ),
    result:
      war.state === "warEnded"
        ? war.clan.stars > war.opponent.stars ||
          (war.clan.stars === war.opponent.stars &&
            war.clan.destructionPercentage > war.opponent.destructionPercentage)
          ? "win"
          : war.clan.stars === war.opponent.stars &&
              war.clan.destructionPercentage ===
                war.opponent.destructionPercentage
            ? "tie"
            : "lose"
        : null,
  };

  const row = existing
    ? await prisma.cocWar.update({ where: { id: existing.id }, data })
    : await prisma.cocWar.create({ data: { ...data, warTag } });

  await captureSideAttacks(row.id, war.clan, war.opponent, true);
  await captureSideAttacks(row.id, war.opponent, war.clan, false);
}

async function captureSideAttacks(
  warId: string,
  side: CocWarSide,
  other: CocWarSide,
  isClanSide: boolean
) {
  const defenderTH = new Map(
    (other.members ?? []).map((m) => [normalizeTag(m.tag), m.townhallLevel])
  );
  const defenderPos = new Map(
    (other.members ?? []).map((m) => [normalizeTag(m.tag), m.mapPosition])
  );
  const defenderName = new Map(
    (other.members ?? []).map((m) => [normalizeTag(m.tag), m.name])
  );

  for (const m of side.members ?? []) {
    for (const a of m.attacks ?? []) {
      const dTag = normalizeTag(a.defenderTag);
      await prisma.cocWarAttack.upsert({
        where: {
          warId_isClanSide_order: {
            warId,
            isClanSide,
            order: a.order,
          },
        },
        update: {
          stars: a.stars,
          destruction: a.destructionPercentage,
          duration: a.duration ?? null,
        },
        create: {
          warId,
          isClanSide,
          order: a.order,
          attackerTag: normalizeTag(a.attackerTag),
          attackerName: m.name,
          attackerTH: m.townhallLevel,
          attackerMapPos: m.mapPosition,
          defenderTag: dTag,
          defenderName: defenderName.get(dTag) ?? "",
          defenderTH: defenderTH.get(dTag) ?? 0,
          defenderMapPos: defenderPos.get(dTag) ?? 0,
          stars: a.stars,
          destruction: a.destructionPercentage,
          duration: a.duration ?? null,
        },
      });
    }
  }
}

// ---------- war log backfill ----------

/**
 * /clans/{tag}/warlog returns recent regular wars (summary only — no attack
 * detail). Merges them into CocWar so the results chart has history; wars
 * already captured via currentwar keep their attack rows.
 */
export async function syncWarLog(): Promise<string> {
  await ensureWal();
  const cfg = await cocConfig();
  const clanTag = requireClanTag(cfg);

  let items;
  try {
    ({ items } = await api.warLog(clanTag));
  } catch (e) {
    if (e instanceof CocApiError && e.status === 403) return "war log private";
    throw e;
  }

  let added = 0;
  let updated = 0;
  for (const w of items ?? []) {
    const end = parseCocTime(w.endTime);
    const oppTag = w.opponent?.tag ? normalizeTag(w.opponent.tag) : null;
    if (!end) continue;

    const data = {
      type: "regular",
      state: "warEnded",
      endTime: end,
      teamSize: w.teamSize ?? 0,
      attacksPerMember: w.attacksPerMember ?? 1,
      opponentTag: oppTag,
      opponentName: w.opponent?.name ?? null,
      opponentLevel: w.opponent?.clanLevel ?? null,
      clanBadge: w.clan?.badgeUrls?.medium ?? null,
      opponentBadge: w.opponent?.badgeUrls?.medium ?? null,
      clanAttacks: w.clan?.attacks ?? 0,
      opponentAttacks: w.opponent?.attacks ?? 0,
      expEarned: w.clan?.expEarned ?? 0,
      clanStars: w.clan?.stars ?? 0,
      opponentStars: w.opponent?.stars ?? 0,
      clanDestruction: w.clan?.destructionPercentage ?? 0,
      opponentDestruction: w.opponent?.destructionPercentage ?? 0,
      result: w.result ?? null,
    };

    // Match a war captured live (same opponent + end time) or a prior backfill.
    const existing = await prisma.cocWar.findFirst({
      where: { type: "regular", endTime: end, opponentTag: oppTag },
    });
    if (existing) {
      await prisma.cocWar.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.cocWar.create({ data });
      added++;
    }
  }
  return `war log: ${added} added, ${updated} updated`;
}

// ---------- daily member snapshots ----------

export async function snapshotMembers(): Promise<string> {
  await ensureWal();
  const cfg = await cocConfig();
  requireClanTag(cfg);

  const members = await prisma.cocPlayer.findMany({
    where: { inClan: true },
    select: { tag: true, clanRank: true },
  });
  const rankByTag = new Map(members.map((m) => [m.tag, m.clanRank]));
  // Always include the configured player even if not currently in clan.
  const tags = new Set(members.map((m) => m.tag));
  if (cfg.playerTag) tags.add(normalizeTag(cfg.playerTag));

  let ok = 0;
  let failed = 0;
  for (const tag of tags) {
    try {
      const p = await api.player(tag);
      await prisma.cocPlayer.upsert({
        where: { tag: normalizeTag(p.tag) },
        update: {
          name: p.name,
          townHall: p.townHallLevel,
          lastSeenAt: new Date(),
          isMe: normalizeTag(cfg.playerTag) === normalizeTag(p.tag),
        },
        create: {
          tag: normalizeTag(p.tag),
          name: p.name,
          townHall: p.townHallLevel,
          inClan: false,
          isMe: normalizeTag(cfg.playerTag) === normalizeTag(p.tag),
        },
      });
      await prisma.cocPlayerSnapshot.create({
        data: {
          playerTag: normalizeTag(p.tag),
          townHall: p.townHallLevel ?? 0,
          expLevel: p.expLevel ?? 0,
          trophies: p.trophies ?? 0,
          bestTrophies: p.bestTrophies ?? 0,
          legendTrophies: p.legendStatistics?.legendTrophies ?? null,
          leagueName: p.leagueTier?.name ?? null,
          attackWins: p.attackWins ?? 0,
          defenseWins: p.defenseWins ?? 0,
          warStars: p.warStars ?? 0,
          donations: p.donations ?? 0,
          donationsReceived: p.donationsReceived ?? 0,
          clanCapitalContributions: p.clanCapitalContributions ?? 0,
          builderHall: p.builderHallLevel ?? null,
          builderBaseTrophies: p.builderBaseTrophies ?? 0,
          versusBattleWins: p.versusBattleWins ?? 0,
          clanRank: rankByTag.get(normalizeTag(p.tag)) ?? null,
          legendPrevSeason:
            p.legendStatistics?.previousSeason?.trophies ?? null,
          legendBestSeason: p.legendStatistics?.bestSeason?.trophies ?? null,
          achievements: p.achievements
            ? JSON.stringify(p.achievements)
            : null,
          heroes: p.heroes ? JSON.stringify(p.heroes) : null,
          heroEquipment: p.heroEquipment
            ? JSON.stringify(p.heroEquipment)
            : null,
          troops: p.troops
            ? JSON.stringify(
                p.troops.filter((t) => t.village === "home")
              )
            : null,
          spells: p.spells
            ? JSON.stringify(
                p.spells.filter((s) => s.village === "home")
              )
            : null,
          pets: p.pets
            ? JSON.stringify(
                p.pets.filter((x) => x.village === "home")
              )
            : null,
        },
      });
      ok++;
    } catch {
      failed++;
    }
  }
  return `snapshotted ${ok} players${failed ? `, ${failed} failed` : ""}`;
}

// ---------- clan capital raids ----------

export async function syncRaids(): Promise<string> {
  await ensureWal();
  const cfg = await cocConfig();
  const clanTag = requireClanTag(cfg);

  const { items } = await api.raidSeasons(clanTag, 30);
  let n = 0;
  for (const s of items ?? []) {
    const start = parseCocTime(s.startTime);
    if (!start) continue;
    const seasonId = s.startTime!;
    await prisma.cocRaidSeason.upsert({
      where: { seasonId },
      update: {
        state: s.state ?? null,
        endTime: parseCocTime(s.endTime),
        capitalTotalLoot: s.capitalTotalLoot ?? 0,
        raidsCompleted: s.raidsCompleted ?? 0,
        totalAttacks: s.totalAttacks ?? 0,
        enemyDistrictsDestroyed: s.enemyDistrictsDestroyed ?? 0,
        offensiveReward: s.offensiveReward ?? 0,
        defensiveReward: s.defensiveReward ?? 0,
        members: s.members ? JSON.stringify(s.members) : null,
        attackLog: s.attackLog ? JSON.stringify(s.attackLog) : null,
        defenseLog: s.defenseLog ? JSON.stringify(s.defenseLog) : null,
      },
      create: {
        seasonId,
        state: s.state ?? null,
        startTime: start,
        endTime: parseCocTime(s.endTime),
        capitalTotalLoot: s.capitalTotalLoot ?? 0,
        raidsCompleted: s.raidsCompleted ?? 0,
        totalAttacks: s.totalAttacks ?? 0,
        enemyDistrictsDestroyed: s.enemyDistrictsDestroyed ?? 0,
        offensiveReward: s.offensiveReward ?? 0,
        defensiveReward: s.defensiveReward ?? 0,
        members: s.members ? JSON.stringify(s.members) : null,
        attackLog: s.attackLog ? JSON.stringify(s.attackLog) : null,
        defenseLog: s.defenseLog ? JSON.stringify(s.defenseLog) : null,
      },
    });
    n++;
  }
  return `synced ${n} raid seasons`;
}

// ---------- battle logs (ranked/legend battles) ----------

export async function syncBattleLogs(): Promise<string> {
  await ensureWal();
  const tracked = await prisma.cocPlayer.findMany({
    where: { OR: [{ isMe: true }, { inClan: true }] },
    select: { tag: true },
  });

  let stored = 0;
  let unsupported = 0;
  for (const { tag } of tracked) {
    let items: Record<string, unknown>[];
    try {
      ({ items } = await api.battleLog(tag, 30));
    } catch (e) {
      // 404/403 = endpoint unavailable for this player — skip quietly.
      if (e instanceof CocApiError) unsupported++;
      continue;
    }
    for (const b of items ?? []) {
      const parsed = parseBattle(b);
      if (!parsed) continue;
      try {
        await prisma.cocBattle.upsert({
          where: {
            playerTag_ts_type: {
              playerTag: tag,
              ts: parsed.ts,
              type: parsed.type,
            },
          },
          update: {},
          create: { playerTag: tag, ...parsed },
        });
        stored++;
      } catch {
        // duplicate or malformed — skip
      }
    }
  }
  return `battle logs: ${stored} new entries${unsupported ? `, ${unsupported} players unsupported` : ""}`;
}

/** Best-effort parse of a battlelog entry — the schema is new and may vary. */
function parseBattle(b: Record<string, unknown>) {
  const raw = JSON.stringify(b);
  const timeStr =
    (b.battleTime as string) ?? (b.time as string) ?? (b.endTime as string);
  const ts = parseCocTime(timeStr) ?? (timeStr ? new Date(timeStr) : null);
  if (!ts || isNaN(ts.getTime())) return null;

  const type = (b.type as string) ?? (b.battleType as string) ?? "unknown";
  const attack = (b.attack ?? b.attacker ?? {}) as Record<string, unknown>;
  const defender = (b.defender ?? b.opponent ?? {}) as Record<string, unknown>;
  const loot = (attack.loot ?? b.loot) as
    | { gold?: number; elixir?: number; darkElixir?: number }
    | undefined;

  return {
    ts,
    type,
    stars: num(attack.stars ?? b.stars),
    destruction: num(attack.destructionPercentage ?? b.destructionPercentage),
    trophiesDelta: num(b.trophies ?? attack.trophies),
    opponentTag: (defender.tag as string) ?? null,
    opponentName: (defender.name as string) ?? null,
    opponentTH: num(defender.townHallLevel ?? defender.townhallLevel),
    lootGold: num(loot?.gold),
    lootElixir: num(loot?.elixir),
    lootDark: num(loot?.darkElixir),
    raw,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}
