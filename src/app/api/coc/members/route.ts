import {
  getMembers,
  getPlayerHistory,
  getProgressLog,
} from "@/lib/coc/overview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tag = url.searchParams.get("tag");
  if (tag) {
    if (url.searchParams.get("log"))
      return Response.json(await getProgressLog(tag));
    const days = Number(url.searchParams.get("days") ?? 90);
    return Response.json(await getPlayerHistory(tag, days));
  }
  return Response.json(await getMembers());
}
