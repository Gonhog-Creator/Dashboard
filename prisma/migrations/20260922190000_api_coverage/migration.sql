-- Capture previously-dropped API fields across CoC models.

-- CocPlayer: live member-list values refreshed every poll.
ALTER TABLE "CocPlayer" ADD COLUMN "trophies" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocPlayer" ADD COLUMN "donations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocPlayer" ADD COLUMN "donationsReceived" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocPlayer" ADD COLUMN "expLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocPlayer" ADD COLUMN "clanRank" INTEGER;
ALTER TABLE "CocPlayer" ADD COLUMN "previousClanRank" INTEGER;

-- CocPlayerSnapshot: builder base, legend seasons, achievements.
ALTER TABLE "CocPlayerSnapshot" ADD COLUMN "builderBaseTrophies" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocPlayerSnapshot" ADD COLUMN "legendPrevSeason" INTEGER;
ALTER TABLE "CocPlayerSnapshot" ADD COLUMN "legendBestSeason" INTEGER;
ALTER TABLE "CocPlayerSnapshot" ADD COLUMN "achievements" TEXT;

-- CocClanSnapshot: capital/builder-base points + clan metadata.
ALTER TABLE "CocClanSnapshot" ADD COLUMN "capitalPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocClanSnapshot" ADD COLUMN "builderBasePoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocClanSnapshot" ADD COLUMN "warFrequency" TEXT;
ALTER TABLE "CocClanSnapshot" ADD COLUMN "location" TEXT;
ALTER TABLE "CocClanSnapshot" ADD COLUMN "description" TEXT;
ALTER TABLE "CocClanSnapshot" ADD COLUMN "isWarLogPublic" BOOLEAN;

-- CocWar: attack counts, XP, prep start, enemy roster.
ALTER TABLE "CocWar" ADD COLUMN "preparationStartTime" DATETIME;
ALTER TABLE "CocWar" ADD COLUMN "clanAttacks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocWar" ADD COLUMN "opponentAttacks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocWar" ADD COLUMN "expEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocWar" ADD COLUMN "opponentMembers" TEXT;

-- CocRaidSeason: district-level attack/defense logs.
ALTER TABLE "CocRaidSeason" ADD COLUMN "attackLog" TEXT;
ALTER TABLE "CocRaidSeason" ADD COLUMN "defenseLog" TEXT;

-- CocBattle: loot gained per attack.
ALTER TABLE "CocBattle" ADD COLUMN "lootGold" INTEGER;
ALTER TABLE "CocBattle" ADD COLUMN "lootElixir" INTEGER;
ALTER TABLE "CocBattle" ADD COLUMN "lootDark" INTEGER;

-- CWL league group (8-clan bracket) per season.
CREATE TABLE "CocCwlSeason" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "season" TEXT NOT NULL,
    "state" TEXT,
    "clans" TEXT,
    "rounds" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CocCwlSeason_season_key" ON "CocCwlSeason"("season");
