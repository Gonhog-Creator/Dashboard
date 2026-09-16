import { NextRequest } from "next/server";
import { tonightTargets, moonTrackTonight } from "@/lib/astro/visibility";
import { prisma, ensureWal } from "@/lib/db";
import { getAstroCovers } from "@/lib/settings";

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "25", 10));
  try {
    await ensureWal();
    const [targets, rows, covers, moonTrack] = await Promise.all([
      tonightTargets(limit),
      prisma.astroTarget.findMany({ select: { name: true, finals: true } }),
      getAstroCovers(),
      moonTrackTonight(),
    ]);

    const byNorm = new Map(rows.map((r) => [normName(r.name), r]));
    const enriched = targets.map((t) => {
      const row = byNorm.get(normName(t.name));
      let local: string | null = null;
      if (row) {
        const finals: string[] = row.finals ? JSON.parse(row.finals) : [];
        const rel = covers[row.name] ?? finals[0] ?? null;
        if (rel) local = `/api/astro/image?path=${encodeURIComponent(rel)}`;
      }
      return { ...t, imageUrl: local ?? dssCutout(t.ra, t.dec) };
    });

    return Response.json({ targets: enriched, moonTrack });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
