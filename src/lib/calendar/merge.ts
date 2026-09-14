import type { CalendarEvent } from "@/types";
import { fetchGoogleEvents } from "./google";
import { fetchAppleEvents } from "./apple";

export async function fetchMergedEvents(
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
