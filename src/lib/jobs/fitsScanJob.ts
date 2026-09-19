import { prisma } from "@/lib/db";
import { scanFitsLibrary } from "@/lib/astro/fits";
import { getFitsScanPath } from "@/lib/settings";
import { bustNeedsUpdate } from "@/lib/astro/needsUpdate";
import { registerJob } from "./scheduler";

export async function runFitsScan(): Promise<string> {
  const root = await getFitsScanPath();
  if (!root) return "skipped: no FITS scan path configured";

  const result = await scanFitsLibrary(root);

  // Safety: a scan that finds nothing almost always means the drive/path was
  // unreachable — never wipe existing data on an empty result.
  if (result.fileCount === 0) {
    const detail = result.errors.length ? ` — ${result.errors[0]}` : "";
    return `found 0 light frames under ${root}; kept existing data${detail}`;
  }

  // Persist results into AstroTarget + AstroSession
  for (const t of result.targets) {
    const detail = {
      totalFrames: t.frames,
      totalSeconds: t.totalSeconds,
      totalBytes: t.totalBytes,
      lastImagedAt: t.lastImagedAt ? new Date(t.lastImagedAt) : null,
      aliases: JSON.stringify(t.aliases),
      filters: JSON.stringify(t.filters),
      finals: JSON.stringify(t.finals),
    };
    const target = await prisma.astroTarget.upsert({
      where: { name: t.object },
      update: detail,
      create: { name: t.object, ...detail },
    });

    // Replace session rows for this target (idempotent rescan)
    await prisma.astroSession.deleteMany({ where: { targetId: target.id } });
    await prisma.astroSession.createMany({
      data: t.sessions.map((s) => ({
        targetId: target.id,
        date: s.date,
        frames: s.frames,
        seconds: s.seconds,
        bytes: s.bytes,
        path: s.path,
      })),
    });
  }

  // Remove targets that no longer appear on disk
  const seen = new Set(result.targets.map((t) => t.object));
  await prisma.astroTarget.deleteMany({
    where: { name: { notIn: [...seen] } },
  });

  const errNote = result.errors.length
    ? `, ${result.errors.length} unreadable dir(s)`
    : "";
  bustNeedsUpdate();
  return `${result.fileCount} light frames, ${result.targets.length} targets${errNote}`;
}

registerJob({
  key: "fits-scan",
  name: "Scan FITS library",
  defaultSchedule: "0 * * * *",
  handler: runFitsScan,
});
