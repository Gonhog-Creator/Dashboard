import { FACILITIES } from "@/lib/science/facilities";
import { getFacilityStatuses, type FacilityStatus } from "@/lib/science/status";
import {
  getNewsByFacility,
  pollScienceNews,
  type FacilityNewsState,
} from "@/lib/science/news";
import { prisma, ensureWal } from "@/lib/db";

export const dynamic = "force-dynamic";

let lastPollKick = 0;

/** Fire a background feed poll when the table is empty or stale (>30 min). */
async function kickPollIfStale() {
  if (Date.now() - lastPollKick < 30 * 60_000) return;
  lastPollKick = Date.now();
  try {
    await ensureWal();
    const latest = await prisma.scienceNews.findFirst({
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    });
    const stale = !latest || Date.now() - latest.fetchedAt.getTime() > 30 * 60_000;
    if (stale) {
      void pollScienceNews().catch((e) =>
        console.warn("[science] background poll failed:", e)
      );
    }
  } catch {
    // db hiccup — skip the kick
  }
}

export async function GET() {
  void kickPollIfStale();
  const [statuses, news] = await Promise.all([
    getFacilityStatuses().catch((): Record<string, FacilityStatus> => ({})),
    getNewsByFacility().catch((): Record<string, FacilityNewsState> => ({})),
  ]);

  const facilities = FACILITIES.map((f) => ({
    id: f.id,
    name: f.name,
    short: f.short,
    kind: f.kind,
    lat: f.lat,
    lon: f.lon,
    location: f.location,
    url: f.url,
    blurb: f.blurb,
    image: f.image ?? null,
    status: statuses[f.id] ?? "unknown",
    unseen: news[f.id]?.unseen ?? 0,
    news: news[f.id]?.items ?? [],
  }));

  return Response.json({
    facilities,
    totalUnseen: facilities.reduce((s, f) => s + f.unseen, 0),
    fetchedAt: new Date().toISOString(),
  });
}
