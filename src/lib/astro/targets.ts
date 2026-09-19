import { prisma, ensureWal } from "@/lib/db";
import { getAstroCovers } from "@/lib/settings";
import { tonightData } from "./visibility";
import type { VisibleTarget } from "@/types";

/** DSS2 color cutout from CDS hips2fits — a real survey image of the object. */
function dssCutout(raHours: number, dec: number): string {
  const params = new URLSearchParams({
    hips: "CDS/P/DSS2/color",
    ra: (raHours * 15).toFixed(4),
    dec: dec.toFixed(4),
    fov: "0.5",
    width: "240",
    height: "240",
    projection: "TAN",
    coordsys: "icrs",
    format: "jpg",
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params}`;
}

/** Match a suggested (catalog-name) target to a library row, tolerating spacing. */
function normName(n: string) {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface TonightTargetsResult {
  targets: VisibleTarget[];
  moonTrack: { t: string; alt: number }[];
}

/**
 * Tonight's ranked targets enriched with library/DSS imagery. The expensive
 * astronomy computation is cached inside tonightData(); the DB enrichment is
 * cheap and runs per call so cover changes show up immediately.
 */
export async function getEnrichedTargets(
  limit = 25
): Promise<TonightTargetsResult> {
  await ensureWal();
  const [{ targets, moonTrack }, rows, covers] = await Promise.all([
    tonightData(),
    prisma.astroTarget.findMany({ select: { name: true, finals: true } }),
    getAstroCovers(),
  ]);

  const byNorm = new Map(rows.map((r) => [normName(r.name), r]));
  const enriched = targets.slice(0, limit).map((t) => {
    const row = byNorm.get(normName(t.name));
    let local: string | null = null;
    if (row) {
      const finals: string[] = row.finals ? JSON.parse(row.finals) : [];
      const rel = covers[row.name] ?? finals[0] ?? null;
      if (rel) local = `/api/astro/image?path=${encodeURIComponent(rel)}`;
    }
    return { ...t, imageUrl: local ?? dssCutout(t.ra, t.dec) };
  });

  return { targets: enriched, moonTrack };
}
