-- CreateTable
CREATE TABLE "FinInstitution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "portalUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FinAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "plaidAccountId" TEXT,
    "name" TEXT NOT NULL,
    "mask" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currentBalance" REAL,
    "balanceUpdatedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinAccount_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "FinInstitution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "plaidTransactionId" TEXT,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "merchantName" TEXT,
    "amount" REAL NOT NULL,
    "categoryId" TEXT,
    "plaidCategory" TEXT,
    "transactionType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "dedupeHash" TEXT,
    "importId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "keywords" TEXT,
    "isIncome" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FinRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT,
    "description" TEXT,
    "quantity" REAL,
    "price" REAL,
    "value" REAL,
    "costBasis" REAL,
    "asOf" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinHolding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinBalanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "balance" REAL NOT NULL,
    CONSTRAINT "FinBalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinRecurringStream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "displayName" TEXT,
    "amount" REAL,
    "frequency" TEXT NOT NULL,
    "nextExpected" DATETIME,
    "lastSeen" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinRecurringStream_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "accountId" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "cursor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaidItem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "FinInstitution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FinAccount_institutionId_idx" ON "FinAccount"("institutionId");

-- CreateIndex
CREATE INDEX "FinAccount_plaidAccountId_idx" ON "FinAccount"("plaidAccountId");

-- CreateIndex
CREATE INDEX "FinTransaction_accountId_date_idx" ON "FinTransaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "FinTransaction_plaidTransactionId_idx" ON "FinTransaction"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "FinTransaction_dedupeHash_idx" ON "FinTransaction"("dedupeHash");

-- CreateIndex
CREATE INDEX "FinTransaction_categoryId_date_idx" ON "FinTransaction"("categoryId", "date");

-- CreateIndex
CREATE INDEX "FinTransaction_date_idx" ON "FinTransaction"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FinCategory_name_key" ON "FinCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinRule_pattern_key" ON "FinRule"("pattern");

-- CreateIndex
CREATE INDEX "FinHolding_accountId_asOf_idx" ON "FinHolding"("accountId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "FinBalanceSnapshot_accountId_date_key" ON "FinBalanceSnapshot"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_institutionId_key" ON "PlaidItem"("institutionId");
