import {
  DashboardGrid,
  type DashboardData,
  type SavedLayout,
} from "@/components/layout/DashboardGrid";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { parseLinks } from "@/components/QuickLinks";
import { getTonight } from "@/lib/astro/weather";
import { getEnrichedTargets } from "@/lib/astro/targets";
import { getNeedsUpdate } from "@/lib/astro/needsUpdate";
import { calendarRange, fetchMergedEvents } from "@/lib/calendar/merge";
import { listTasks } from "@/lib/todo";
import { getSystemInfo } from "@/lib/system";
import { prisma, ensureWal } from "@/lib/db";

export const dynamic = "force-dynamic";

const LAYOUT_KEY = "dashboard.layout.v2";

/** Fetch every widget's data in parallel; failures degrade to client fetch. */
async function loadDashboardData(): Promise<DashboardData> {
  const { start, end } = calendarRange(2);
  const [tonight, agenda, tasks, targets, report, needsUpdate, system, links] =
    await Promise.all([
      getTonight().catch(() => null),
      fetchMergedEvents(start, end).catch(() => null),
      listTasks({ done: false }).catch(() => null),
      getEnrichedTargets(5).catch(() => null),
      prisma.report
        .findMany({ orderBy: { generatedAt: "desc" }, take: 3 })
        .then((rs) =>
          rs.map((r) => ({ ...r, generatedAt: r.generatedAt.toISOString() }))
        )
        .catch(() => null),
      getNeedsUpdate().catch(() => null),
      getSystemInfo().catch(() => null),
      getSetting(SETTING_KEYS.quickLinks).then(parseLinks).catch(() => null),
    ]);
  return { tonight, agenda, tasks, targets, report, needsUpdate, system, links };
}

export default async function Home() {
  await ensureWal();
  const [raw, data] = await Promise.all([
    getSetting(LAYOUT_KEY),
    loadDashboardData(),
  ]);

  let initial: SavedLayout | null = null;
  if (raw) {
    try {
      initial = JSON.parse(raw) as SavedLayout;
    } catch {
      initial = null;
    }
  }

  return <DashboardGrid initial={initial} data={data} />;
}
