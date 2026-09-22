-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "birthday" TEXT,
    "meetUrl" TEXT,
    "avatarUrl" TEXT,
    "notes" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "googleResourceName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PersonRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    CONSTRAINT "PersonRelationship_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonRelationship_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'url',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileId" TEXT,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonTask_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "Person_company_idx" ON "Person"("company");

-- CreateIndex
CREATE INDEX "Person_location_idx" ON "Person"("location");

-- CreateIndex
CREATE UNIQUE INDEX "Person_googleResourceName_key" ON "Person"("googleResourceName");

-- CreateIndex
CREATE INDEX "PersonRelationship_toId_idx" ON "PersonRelationship"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonRelationship_fromId_toId_type_key" ON "PersonRelationship"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "PersonLink_personId_idx" ON "PersonLink"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonTask_personId_taskId_key" ON "PersonTask"("personId", "taskId");
