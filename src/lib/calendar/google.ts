import { google } from "googleapis";
import { auth, authEnabled } from "@/lib/auth";
import type { CalendarEvent } from "@/types";

/** List the user's calendars — used to build the merged embed URL. */
export async function fetchCalendarList(): Promise<
  { id: string; summary: string; primary: boolean }[]
> {
  if (!authEnabled) return [];
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) return [];

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const res = await calendar.calendarList.list({ maxResults: 50 });
  return (res.data.items ?? [])
    .filter((c) => c.id && c.accessRole !== "freeBusyReader")
    .map((c) => ({
      id: c.id!,
      summary: c.summary ?? c.id!,
      primary: Boolean(c.primary),
    }));
}

export async function fetchGoogleEvents(
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEvent[]> {
  if (!authEnabled) return [];
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) return [];

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });

  return (res.data.items ?? []).map((e) => ({
    id: `g-${e.id}`,
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    allDay: Boolean(e.start?.date && !e.start?.dateTime),
    source: "google" as const,
    calendar: e.organizer?.displayName ?? undefined,
    location: e.location ?? undefined,
  }));
}
