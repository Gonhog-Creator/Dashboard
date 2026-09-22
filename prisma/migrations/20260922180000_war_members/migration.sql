-- Add war roster snapshot so we can show who didn't attack.
ALTER TABLE "CocWar" ADD COLUMN "members" TEXT;
