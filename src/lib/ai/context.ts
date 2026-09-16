import { prisma, ensureWal } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { fetchMergedEvents } from "@/lib/calendar/merge";
import type { TonightConditions } from "@/types";

/**
 * Builds the dashboard-state system context injected into chat and reports.
 * Every section is best-effort — a failing source degrades gracefully.
 */
export async function buildContext(): Promise<string> {
  await ensureWal();
  const parts: string[] = [
    "You are the assistant inside the user's personal command-center dashboard.",
    "Answer concisely. You have live access to their tasks, calendar, and astrophotography data below.",
  ];

  // Tasks
  try {
    const tasks = await prisma.task.findMany({
      where: { done: false },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 20,
      include: { project: true },
    });
    if (tasks.length) {
      parts.push(
        "## Open tasks\n" +
          tasks
            .map(
              (t) =>
                `- ${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().slice(0, 10)})` : ""}${t.isAstro ? " [astro]" : ""}`
            )
            .join("\n")
      );
    }
  } catch {
    /* skip */
  }

  // Calendar (next 48h)
  try {
    const now = new Date();
    const end = new Date(now.getTime() + 48 * 3600 * 1000);
    const { events } = await fetchMergedEvents(now, end);
    if (events.length) {
      parts.push(
        "## Calendar (next 48h)\n" +
          events
            .slice(0, 15)
            .map(
              (e) =>
                `- ${e.allDay ? "all-day" : new Date(e.start).toLocaleString()} ${e.title} [${e.source}]`
            )
            .join("\n")
      );
    }
  } catch {
    /* skip */
  }

  // Tonight's astro conditions (cached by the weather job)
  try {
    const cached = await getSetting("cache.tonight");
    if (cached) {
      const c = JSON.parse(cached) as TonightConditions;
      parts.push(
        `## Tonight's astro conditions (${c.observer.name})\n` +
          `- Verdict: ${c.verdict.level} (score ${c.verdict.score})\n` +
          `- Darkness: ${c.darkHours}h, moon ${c.moon.name} ${Math.round(c.moon.phase * 100)}%\n` +
          `- Reasons: ${c.verdict.reasons.join("; ")}`
      );
    }
  } catch {
    /* skip */
  }

  // FITS library summary
  try {
    const targets = await prisma.astroTarget.findMany({
      orderBy: { totalSeconds: "desc" },
      take: 10,
    });
    if (targets.length) {
      parts.push(
        "## Imaged targets (top by exposure)\n" +
          targets
            .map(
              (t) =>
                `- ${t.name}: ${(t.totalSeconds / 3600).toFixed(1)}h, ${t.totalFrames} frames${t.published ? " [published]" : ""}`
            )
            .join("\n")
      );
    }
  } catch {
    /* skip */
  }

  return parts.join("\n\n");
}
