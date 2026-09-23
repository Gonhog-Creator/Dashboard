import { getGlobalStats } from "@/lib/coc/global";

export const dynamic = "force-dynamic";

/** GET /api/coc/global?location=32000000 — global/location leaderboards. */
export async function GET(req: Request) {
  const loc = new URL(req.url).searchParams.get("location");
  const id = loc ? Number(loc) : undefined;
  if (id != null && !Number.isFinite(id))
    return Response.json({ error: "bad location" }, { status: 400 });
  return Response.json(await getGlobalStats(id));
}
