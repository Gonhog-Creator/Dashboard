import { prisma, ensureWal } from "@/lib/db";
import {
  fetchPublishedTargets,
  normalizePublishedName,
} from "@/lib/astro/websiteSync";
import { findInCatalog } from "@/lib/astro/catalog";

export async function GET() {
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
      return !publishedNormalized.has(catalogName) && !publishedNormalized.has(t.name);
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      catalogName: findInCatalog(t.name)?.name ?? null,
      totalSeconds: t.totalSeconds,
      totalFrames: t.totalFrames,
      lastImagedAt: t.lastImagedAt,
    }));

  return Response.json({
    needsUpdate,
    publishedCount: published.names.length,
    scannedCount: scanned.length,
    error: published.error ?? null,
  });
}
