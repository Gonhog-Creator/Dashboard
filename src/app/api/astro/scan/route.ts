import path from "path";
import { prisma, ensureWal } from "@/lib/db";
import { runJob } from "@/lib/jobs";
import { getAstroCovers, getFitsScanPath } from "@/lib/settings";
import { commonNameFor } from "@/lib/astro/catalog";
import type { FilterBreakdown, LibraryTarget } from "@/types";

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** First path segment under the scan root, e.g. "SeeStar Raw" -> "SeeStar". */
function scopeFromPath(root: string, sessionPath: string): string | null {
  const rel = path.relative(root, sessionPath);
  if (rel.startsWith("..")) return null;
  const first = rel.split(path.sep).filter(Boolean)[0];
  if (!first) return null;
  return first.replace(/\s*raw\s*$/i, "").trim() || first;
}

export async function GET() {
  await ensureWal();
  const root = await getFitsScanPath();
  const rows = await prisma.astroTarget.findMany({
    orderBy: { totalSeconds: "desc" },
    include: { sessions: { orderBy: { date: "desc" } } },
  });
  const covers = await getAstroCovers();

  const targets: LibraryTarget[] = rows.map((t) => {
    const scopes = new Set<string>();
    for (const s of t.sessions) {
      const scope = root ? scopeFromPath(root, s.path) : null;
      if (scope) scopes.add(scope);
    }
    return {
      id: t.id,
      name: t.name,
      commonName: commonNameFor(t.name),
      aliases: parseJson<string[]>(t.aliases, []),
      scopes: [...scopes].sort(),
      totalFrames: t.totalFrames,
      totalSeconds: t.totalSeconds,
      totalBytes: t.totalBytes,
      lastImagedAt: t.lastImagedAt?.toISOString() ?? null,
      published: t.published,
      filters: parseJson<FilterBreakdown[]>(t.filters, []),
      finals: parseJson<string[]>(t.finals, []),
      cover: covers[t.name] ?? null,
      sessions: t.sessions.map((s) => ({
        id: s.id,
        date: s.date,
        frames: s.frames,
        seconds: s.seconds,
      })),
    };
  });

  return Response.json({ targets });
}

export async function POST() {
  const result = await runJob("fits-scan");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
