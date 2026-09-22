-- Clan badge URLs for war rows/modal (CoC-style banners).
ALTER TABLE "CocWar" ADD COLUMN "clanBadge" TEXT;
ALTER TABLE "CocWar" ADD COLUMN "opponentBadge" TEXT;
