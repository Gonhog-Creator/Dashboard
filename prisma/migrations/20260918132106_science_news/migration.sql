-- CreateTable
CREATE TABLE "ScienceNews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ScienceNews_facilityId_seenAt_idx" ON "ScienceNews"("facilityId", "seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScienceNews_facilityId_url_key" ON "ScienceNews"("facilityId", "url");
