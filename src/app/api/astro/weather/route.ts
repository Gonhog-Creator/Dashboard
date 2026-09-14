import { fetchTonight } from "@/lib/astro/weather";
import { getSetting } from "@/lib/settings";
import type { TonightConditions } from "@/types";

export async function GET() {
  try {
    const conditions = await fetchTonight();
    return Response.json(conditions);
  } catch (e) {
    // Stale-data pattern: fall back to last cached fetch
    const cached = await getSetting("cache.tonight");
    if (cached) {
      const parsed = JSON.parse(cached) as TonightConditions;
      return Response.json({ ...parsed, stale: true });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
