import { NextRequest } from "next/server";
import { fetchMergedEvents } from "@/lib/calendar/merge";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.min(14, parseInt(url.searchParams.get("days") ?? "2", 10));

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const { events, errors } = await fetchMergedEvents(start, end);
  return Response.json({ events, errors });
}
