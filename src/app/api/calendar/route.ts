import { NextRequest } from "next/server";
import { fetchMergedEvents } from "@/lib/calendar/merge";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.min(14, parseInt(url.searchParams.get("days") ?? "2", 10));

  // Optional `from=YYYY-MM-DD` (parsed as local midnight) for week views.
  const from = url.searchParams.get("from");
  let start: Date;
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const [y, m, d] = from.split("-").map(Number);
    start = new Date(y, m - 1, d);
  } else {
    start = new Date();
    start.setHours(0, 0, 0, 0);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const { events, errors } = await fetchMergedEvents(start, end);
  return Response.json({ events, errors });
}
