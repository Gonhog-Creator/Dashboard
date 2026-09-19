import type { CalendarEvent } from "@/types";
import { fetchGoogleEvents } from "./google";
import { fetchAppleEvents } from "./apple";
import { cached } from "@/lib/cache";

/** Shared range math for the calendar API and server-rendered pages. */
export function calendarRange(days: number, from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { start, end };
}

const MERGE_TTL_MS = 5 * 60 * 1000;

export function fetchMergedEvents(
  timeMin: Date,
  timeMax: Date
): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  // CalDAV discovery + REPORTs and the Google roundtrip are the slow part;
  // events change rarely, so serve a merged snapshot for 5 minutes.
  const key = `cal:${timeMin.toISOString()}:${timeMax.toISOString()}`;
  return cached(key, MERGE_TTL_MS, () =>
    fetchMergedEventsUncached(timeMin, timeMax)
  );
}

async function fetchMergedEventsUncached(
  timeMin: Date,
  timeMax: Date
): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  const errors: string[] = [];
  const [google, apple] = await Promise.all([
    fetchGoogleEvents(timeMin, timeMax).catch((e) => {
      errors.push(`google: ${e instanceof Error ? e.message : e}`);
      return [] as CalendarEvent[];
    }),
    fetchAppleEvents(timeMin, timeMax).catch((e) => {
      errors.push(`apple: ${e instanceof Error ? e.message : e}`);
      return [] as CalendarEvent[];
    }),
  ]);

  const events = [...google, ...apple].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  return { events, errors };
}
