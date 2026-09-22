-- CreateTable
CREATE TABLE "CocPlayer" (
    "tag" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "townHall" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT,
    "inClan" BOOLEAN NOT NULL DEFAULT true,
    "isMe" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CocPlayerSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerTag" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "townHall" INTEGER NOT NULL DEFAULT 0,
    "expLevel" INTEGER NOT NULL DEFAULT 0,
    "trophies" INTEGER NOT NULL DEFAULT 0,
    "bestTrophies" INTEGER NOT NULL DEFAULT 0,
    "legendTrophies" INTEGER,
    "leagueName" TEXT,
    "attackWins" INTEGER NOT NULL DEFAULT 0,
    "defenseWins" INTEGER NOT NULL DEFAULT 0,
    "warStars" INTEGER NOT NULL DEFAULT 0,
    "donations" INTEGER NOT NULL DEFAULT 0,
    "donationsReceived" INTEGER NOT NULL DEFAULT 0,
    "clanCapitalContributions" INTEGER NOT NULL DEFAULT 0,
    "builderHall" INTEGER,
    "heroes" TEXT,
    "heroEquipment" TEXT,
    "troops" TEXT,
    CONSTRAINT "CocPlayerSnapshot_playerTag_fkey" FOREIGN KEY ("playerTag") REFERENCES "CocPlayer" ("tag") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CocClanSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clanLevel" INTEGER NOT NULL DEFAULT 0,
    "clanPoints" INTEGER NOT NULL DEFAULT 0,
    "members" INTEGER NOT NULL DEFAULT 0,
    "warWins" INTEGER NOT NULL DEFAULT 0,
    "warWinStreak" INTEGER NOT NULL DEFAULT 0,
    "warLeague" TEXT,
    "capitalLeague" TEXT,
    "capitalHallLevel" INTEGER
);

-- CreateTable
CREATE TABLE "CocWar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warTag" TEXT,
    "type" TEXT NOT NULL,
    "season" TEXT,
    "state" TEXT NOT NULL,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "teamSize" INTEGER NOT NULL DEFAULT 0,
    "attacksPerMember" INTEGER NOT NULL DEFAULT 1,
    "opponentTag" TEXT,
    "opponentName" TEXT,
    "opponentLevel" INTEGER,
    "clanStars" INTEGER NOT NULL DEFAULT 0,
    "opponentStars" INTEGER NOT NULL DEFAULT 0,
    "clanDestruction" REAL NOT NULL DEFAULT 0,
    "opponentDestruction" REAL NOT NULL DEFAULT 0,
    "result" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CocWarAttack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warId" TEXT NOT NULL,
    "isClanSide" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,
    "attackerTag" TEXT NOT NULL,
    "attackerName" TEXT NOT NULL,
    "attackerTH" INTEGER NOT NULL DEFAULT 0,
    "attackerMapPos" INTEGER NOT NULL DEFAULT 0,
    "defenderTag" TEXT NOT NULL,
    "defenderName" TEXT NOT NULL,
    "defenderTH" INTEGER NOT NULL DEFAULT 0,
    "defenderMapPos" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "destruction" REAL NOT NULL DEFAULT 0,
    "duration" INTEGER,
    CONSTRAINT "CocWarAttack_warId_fkey" FOREIGN KEY ("warId") REFERENCES "CocWar" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CocRaidSeason" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "state" TEXT,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "capitalTotalLoot" INTEGER NOT NULL DEFAULT 0,
    "raidsCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalAttacks" INTEGER NOT NULL DEFAULT 0,
    "enemyDistrictsDestroyed" INTEGER NOT NULL DEFAULT 0,
    "offensiveReward" INTEGER NOT NULL DEFAULT 0,
    "defensiveReward" INTEGER NOT NULL DEFAULT 0,
    "members" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CocBattle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerTag" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'unknown',
    "stars" INTEGER,
    "destruction" REAL,
    "trophiesDelta" INTEGER,
    "opponentTag" TEXT,
    "opponentName" TEXT,
    "opponentTH" INTEGER,
    "raw" TEXT
);

-- CreateTable
CREATE TABLE "CocMetaSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CocPlayerSnapshot_playerTag_ts_idx" ON "CocPlayerSnapshot"("playerTag", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "CocWar_warTag_key" ON "CocWar"("warTag");

-- CreateIndex
CREATE INDEX "CocWar_startTime_idx" ON "CocWar"("startTime");

-- CreateIndex
CREATE INDEX "CocWar_type_state_idx" ON "CocWar"("type", "state");

-- CreateIndex
CREATE INDEX "CocWarAttack_attackerTag_idx" ON "CocWarAttack"("attackerTag");

-- CreateIndex
CREATE UNIQUE INDEX "CocWarAttack_warId_isClanSide_order_key" ON "CocWarAttack"("warId", "isClanSide", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CocRaidSeason_seasonId_key" ON "CocRaidSeason"("seasonId");

-- CreateIndex
CREATE INDEX "CocBattle_playerTag_ts_idx" ON "CocBattle"("playerTag", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "CocBattle_playerTag_ts_type_key" ON "CocBattle"("playerTag", "ts", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CocMetaSnapshot_kind_date_key" ON "CocMetaSnapshot"("kind", "date");
