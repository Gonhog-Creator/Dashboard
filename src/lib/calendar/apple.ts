import type { CalendarEvent } from "@/types";

/**
 * Minimal iCloud CalDAV client: PROPFIND to discover calendars, then
 * calendar-query REPORT for VEVENTs in range. Requires an iCloud
 * app-specific password (CALDAV_USERNAME + CALDAV_APP_PASSWORD).
 */

const CALDAV_URL = process.env.CALDAV_URL ?? "https://caldav.icloud.com";
const USER = process.env.CALDAV_USERNAME;
const PASS = process.env.CALDAV_APP_PASSWORD;

function authHeader() {
  return "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
}

async function caldavRequest(
  method: string,
  url: string,
  body: string,
  depth = "1"
): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: depth,
    },
    body,
  });
  if (!res.ok) throw new Error(`CalDAV ${method} ${url} → ${res.status}`);
  return res.text();
}

/** Discover calendar collection URLs under the principal. */
async function discoverCalendars(): Promise<string[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype />
    <d:displayname />
  </d:prop>
</d:propfind>`;

  // iCloud calendar home is at /{dsid}/calendars/ — try the well-known principal path
  const candidates = [
    `${CALDAV_URL}/`,
    `${CALDAV_URL}/calendars/`,
  ];

  for (const base of candidates) {
    try {
      const xml = await caldavRequest("PROPFIND", base, body, "1");
      const urls = [...xml.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi)]
        .map((m) => m[1])
        .filter((h) => /\/calendars?\//.test(h) && h.endsWith("/"));
      if (urls.length) {
        return urls.map((h) =>
          h.startsWith("http") ? h : `https://caldav.icloud.com${h}`
        );
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

function icalDateToIso(v: string): { iso: string; allDay: boolean } {
  // Formats: 20260914T130000Z | 20260914T130000 | 20260914
  const dateOnly = /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return { iso: v, allDay: dateOnly };
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  return { iso, allDay: dateOnly };
}

/** Tiny ICS VEVENT parser — handles line folding and the fields we need. */
function parseIcsEvents(ics: string, calendar?: string): CalendarEvent[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const events: CalendarEvent[] = [];
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);

  for (const block of blocks) {
    const blockEnd = block.indexOf("END:VEVENT");
    const body = blockEnd >= 0 ? block.slice(0, blockEnd) : block;
    const get = (key: string) => {
      const m = body.match(new RegExp(`^${key}[^:]*:(.*)$`, "m"));
      return m ? m[1].trim() : undefined;
    };
    const uid = get("UID") ?? crypto.randomUUID();
    const summary = get("SUMMARY") ?? "(no title)";
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    if (!dtstart) continue;

    const start = icalDateToIso(dtstart);
    const end = dtend ? icalDateToIso(dtend) : start;

    events.push({
      id: `a-${uid}`,
      title: summary,
      start: start.iso,
      end: end.iso,
      allDay: start.allDay,
      source: "apple",
      calendar,
      location: get("LOCATION"),
    });
  }
  return events;
}

function icalDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function fetchAppleEvents(
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEvent[]> {
  if (!USER || !PASS) return [];

  const calendars = await discoverCalendars();
  const events: CalendarEvent[] = [];

  for (const calUrl of calendars.slice(0, 10)) {
    const query = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${icalDateTime(timeMin)}" end="${icalDateTime(timeMax)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

    try {
      const xml = await caldavRequest("REPORT", calUrl, query);
      const calData = [
        ...xml.matchAll(
          /<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/gi
        ),
      ].map((m) => m[1]);
      for (const ics of calData) {
        events.push(...parseIcsEvents(ics));
      }
    } catch (e) {
      console.error(`[caldav] query failed for ${calUrl}`, e);
    }
  }

  return events;
}
