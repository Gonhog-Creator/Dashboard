import { getClashSpotPage } from "@/lib/coc/clashspot";

export const dynamic = "force-dynamic";

/** GET /api/coc/clashspot?path=players/home-village — scraped ClashSpot charts. */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "players/home-village";
  try {
    return Response.json(await getClashSpotPage(path));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    const status = msg.includes("403") ? 429 : 502;
    return Response.json({ error: msg }, { status });
  }
}
