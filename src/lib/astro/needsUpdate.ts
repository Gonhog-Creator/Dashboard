import { prisma, ensureWal } from "@/lib/db";
import { bust, cached } from "@/lib/cache";
import {
  fetchPublishedTargets,
  normalizePublishedName,
} from "./websiteSync";
import { findInCatalog } from "./catalog";

export interface NeedsUpdateItem {
  id: string;
  name: string;
  catalogName: string | null;
  totalSeconds: number;
  totalFrames: number;
  lastImagedAt: string | null; // ISO — matches the JSON the API used to emit
}

export interface NeedsUpdateResult {
  needsUpdate: NeedsUpdateItem[];
  publishedCount: number;
  scannedCount: number;
  error: string | null;
}

const TTL_MS = 10 * 60 * 1000; // published list changes rarely; publish route busts

async function compute(): Promise<NeedsUpdateResult> {
  await ensureWal();
  const [scanned, published] = await Promise.all([
    prisma.astroTarget.findMany({ orderBy: { totalSeconds: "desc" } }),
    fetchPublishedTargets(),
  ]);

  const publishedNormalized = new Set(
    published.names.map(normalizePublishedName)
  );

  const needsUpdate = scanned
    .filter((t) => {
      if (t.published) return false;
      const catalogName = findInCatalog(t.name)?.name ?? t.name;
      return (
        !publishedNormalized.has(catalogName) && !publishedNormalized.has(t.name)
      );
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      catalogName: findInCatalog(t.name)?.name ?? null,
      totalSeconds: t.totalSeconds,
      totalFrames: t.totalFrames,
      lastImagedAt: t.lastImagedAt?.toISOString() ?? null,
    }));

  return {
    needsUpdate,
    publishedCount: published.names.length,
    scannedCount: scanned.length,
    error: published.error ?? null,
  };
}

export function getNeedsUpdate(): Promise<NeedsUpdateResult> {
  return cached("astro:needsUpdate", TTL_MS, compute);
}

export function bustNeedsUpdate() {
  bust("astro:needsUpdate");
}
