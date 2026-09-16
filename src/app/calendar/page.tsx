import { fetchCalendarList } from "@/lib/calendar/google";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const calendars = await fetchCalendarList().catch(() => []);

  // Build the embed URL with every calendar merged in.
  // The iframe renders the signed-in Google user's view — no rebuild needed.
  const params = new URLSearchParams({
    mode: "WEEK",
    showPrint: "0",
    showCalendars: "0",
    showTz: "0",
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  for (const c of calendars) params.append("src", c.id);

  const embedUrl =
    calendars.length > 0
      ? `https://calendar.google.com/calendar/embed?${params}`
      : "https://calendar.google.com/calendar/embed";

  return (
    <iframe
      src={embedUrl}
      className="w-full h-[calc(100vh-3rem)] rounded-lg border border-border"
      style={{ border: 0 }}
      title="Google Calendar"
    />
  );
}
