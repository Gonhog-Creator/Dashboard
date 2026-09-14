import { prisma } from "@/lib/db";
import { scanFitsLibrary } from "@/lib/astro/fits";
import { getFitsScanPath } from "@/lib/settings";
import { registerJob } from "./scheduler";

export async function runFitsScan(): Promise<string> {
  const root = await getFitsScanPath();
  if (!root) return "skipped: no FITS scan path configured";

  const result = await scanFitsLibrary(root);

  // Persist results into AstroTarget + AstroSession
  for (const t of result.targets) {
    const target = await prisma.astroTarget.upsert({
      where: { name: t.object },
      update: {
        totalFrames: t.frames,
        totalSeconds: t.totalSeconds,
        totalBytes: t.totalBytes,
        lastImagedAt: t.lastImagedAt ? new Date(t.lastImagedAt) : null,
      },
      create: {
        name: t.object,
        totalFrames: t.frames,
        totalSeconds: t.totalSeconds,
        totalBytes: t.totalBytes,
        lastImagedAt: t.lastImagedAt ? new Date(t.lastImagedAt) : null,
      },
    });

    // Replace session rows for this target (idempotent rescan)
    await prisma.astroSession.deleteMany({ where: { targetId: target.id } });
    await prisma.astroSession.createMany({
      data: t.sessions.map((s) => ({
        targetId: target.id,
        date: s.date,
        frames: s.frames,
        seconds: s.seconds,
        path: s.path,
      })),
    });
  }

  // Remove targets that no longer appear on disk
  const seen = new Set(result.targets.map((t) => t.object));
  await prisma.astroTarget.deleteMany({
    where: { name: { notIn: [...seen] } },
  });

  return `${result.fileCount} light frames, ${result.targets.length} targets`;
}

registerJob({
  key: "fits-scan",
  name: "Scan FITS library",
  defaultSchedule: "0 * * * *",
  handler: runFitsScan,
});
