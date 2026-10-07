import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// SQLite tuning. journal_mode/WAL is persistent on the db file; the rest are
// per-connection, which is why DATABASE_URL pins connection_limit=1 — a single
// connection makes these pragmas apply to every query and removes lock
// contention between the web routes and the cron job runner.
let walReady: Promise<unknown> | null = null;
export function ensureWal() {
  if (!walReady) {
    walReady = (async () => {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
      await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
      await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
      await prisma.$queryRawUnsafe("PRAGMA temp_store=MEMORY;");
      await prisma.$queryRawUnsafe("PRAGMA mmap_size=67108864;");
    })().catch((e) => {
      console.error("[db] failed to apply sqlite pragmas", e);
    });
  }
  return walReady;
}
