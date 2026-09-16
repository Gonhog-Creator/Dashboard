-- AlterTable
ALTER TABLE "AstroTarget" ADD COLUMN "aliases" TEXT;
ALTER TABLE "AstroTarget" ADD COLUMN "filters" TEXT;
ALTER TABLE "AstroTarget" ADD COLUMN "finals" TEXT;

-- CreateIndex (was applied via db push before migrations tracked it)
CREATE UNIQUE INDEX "AstroTarget_name_key" ON "AstroTarget"("name");
