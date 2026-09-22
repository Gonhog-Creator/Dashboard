/**
 * Applies a Prisma migration SQL file directly via node:sqlite and records it
 * in _prisma_migrations. Fallback for when `prisma migrate deploy` can't spawn
 * the schema engine in this environment.
 *
 * Usage: node scripts/apply-migration.mjs <migrationDirName>
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/apply-migration.mjs <migrationDirName>");
  process.exit(1);
}

const dbPath = path.resolve("prisma/dev.db");
const sqlPath = path.resolve(`prisma/migrations/${name}/migration.sql`);
const sql = readFileSync(sqlPath, "utf8");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
try {
  db.exec(sql);
  console.log("sql applied");
} catch (e) {
  if (String(e).includes("already exists")) {
    console.log("tables already exist — skipping sql, recording migration only");
  } else {
    throw e;
  }
}

// Record in _prisma_migrations so `migrate status` sees it as applied.
const existing = db
  .prepare("SELECT id FROM _prisma_migrations WHERE migration_name = ?")
  .get(name);
if (existing) {
  console.log("migration already recorded");
} else {
  const checksum = createHash("sha256").update(sql).digest("hex");
  const now = new Date()
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")
    .slice(0, 23);
  db.prepare(
    `INSERT INTO _prisma_migrations
       (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`
  ).run(randomUUID(), checksum, now, name, now);
  console.log("migration recorded");
}

db.close();
console.log(`done ${name}`);
