import { WeekView } from "@/components/calendar/WeekView";

export const dynamic = "force-dynamic";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  weekStart.setHours(0, 0, 0, 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <WeekView weekStart={isoDate(weekStart)} nowIso={now.toISOString()} />
    </div>
  );
}
