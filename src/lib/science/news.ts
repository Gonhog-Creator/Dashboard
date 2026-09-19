import Parser from "rss-parser";
import { prisma, ensureWal } from "@/lib/db";
import { FACILITIES } from "./facilities";

const parser = new Parser({
  timeout: 12_000,
  headers: { "User-Agent": "Mozilla/5.0 (personal dashboard; rss poll)" },
});

export interface FacilityNewsItem {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  seen: boolean;
}

/** Poll every facility feed, upsert new items. Returns a summary string for the job log. */
export async function pollScienceNews(): Promise<string> {
  await ensureWal();
  let added = 0;
  let feeds = 0;

  await Promise.allSettled(
    FACILITIES.filter((f) => f.feedUrl).map(async (f) => {
      feeds++;
      try {
        const feed = await parser.parseURL(f.feedUrl!);
        const items = (feed.items ?? []).slice(0, 15);
        for (const it of items) {
          const url = it.link?.trim();
          const title = it.title?.trim();
          if (!url || !title) continue;
          const publishedAt = it.isoDate
            ? new Date(it.isoDate)
            : it.pubDate
              ? new Date(it.pubDate)
              : null;
          const summary =
            (it.contentSnippet ?? it.content ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 400) || null;
          const res = await prisma.scienceNews.upsert({
            where: { facilityId_url: { facilityId: f.id, url } },
            update: {},
            create: { facilityId: f.id, title, url, summary, publishedAt },
          });
          if (res.fetchedAt.getTime() > Date.now() - 5_000) added++;
        }
      } catch (e) {
        console.warn(`[science-news] ${f.id} feed failed:`, (e as Error).message);
      }
    })
  );

  return `polled ${feeds} feeds, ${added} new items`;
}

export interface FacilityNewsState {
  unseen: number;
  items: FacilityNewsItem[];
}

/** Latest items + unseen counts per facility. */
export async function getNewsByFacility(): Promise<Record<string, FacilityNewsState>> {
  await ensureWal();
  const rows = await prisma.scienceNews.findMany({
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: 800,
  });
  const out: Record<string, FacilityNewsState> = {};
  for (const r of rows) {
    const slot = (out[r.facilityId] ??= { unseen: 0, items: [] });
    if (!r.seenAt) slot.unseen++;
    if (slot.items.length < 6) {
      slot.items.push({
        id: r.id,
        title: r.title,
        url: r.url,
        summary: r.summary,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        seen: !!r.seenAt,
      });
    }
  }
  return out;
}

export async function markNewsSeen(facilityId?: string) {
  await ensureWal();
  await prisma.scienceNews.updateMany({
    where: { seenAt: null, ...(facilityId ? { facilityId } : {}) },
    data: { seenAt: new Date() },
  });
}
