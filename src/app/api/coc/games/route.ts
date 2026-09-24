import { getClanGames } from "@/lib/coc/games";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const months = Number(new URL(req.url).searchParams.get("history") ?? 6);
  return Response.json(await getClanGames(Math.min(24, Math.max(0, months))));
}
