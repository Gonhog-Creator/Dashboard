import path from "path";
import { prisma, ensureWal } from "@/lib/db";
import { getAstroCovers, getFitsScanPath } from "@/lib/settings";
import { commonNameFor } from "./catalog";
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

/** FITS library rows shaped for the UI — shared by the scan route and pages. */
export async function getLibraryTargets(): Promise<LibraryTarget[]> {
  await ensureWal();
  const root = await getFitsScanPath();
  const rows = await prisma.astroTarget.findMany({
    orderBy: { totalSeconds: "desc" },
    include: { sessions: { orderBy: { date: "desc" } } },
  });
  const covers = await getAstroCovers();

  return rows.map((t) => {
    const scopes = new Set<string>();
    const perScope = new Map<string, { frames: number; seconds: number }>();
    for (const s of t.sessions) {
      const scope = (root ? scopeFromPath(root, s.path) : null) ?? "Unknown";
      scopes.add(scope);
      const agg = perScope.get(scope) ?? { frames: 0, seconds: 0 };
      agg.frames += s.frames;
      agg.seconds += s.seconds;
      perScope.set(scope, agg);
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
      scopeBreakdown: [...perScope.entries()]
        .map(([scope, a]) => ({ scope, frames: a.frames, seconds: a.seconds }))
        .sort((a, b) => b.seconds - a.seconds),
      sessions: t.sessions.map((s) => ({
        id: s.id,
        date: s.date,
        frames: s.frames,
        seconds: s.seconds,
      })),
    };
  });
}
