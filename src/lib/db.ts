import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// WAL mode: allows concurrent reads while the job runner writes.
let walReady: Promise<unknown> | null = null;
export function ensureWal() {
  if (!walReady) {
    walReady = prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch((e) => {
      console.error("[db] failed to enable WAL mode", e);
    });
  }
  return walReady;
}
