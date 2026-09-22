-- Snapshot extras for progress graphs: versus battle wins + clan rank.
ALTER TABLE "CocPlayerSnapshot" ADD COLUMN "versusBattleWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CocPlayerSnapshot" ADD COLUMN "clanRank" INTEGER;
