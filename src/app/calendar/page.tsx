import { WeekView } from "@/components/calendar/WeekView";
import { fetchMergedEvents } from "@/lib/calendar/merge";

export const dynamic = "force-dynamic";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function CalendarPage() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const initialData = await fetchMergedEvents(weekStart, weekEnd).catch(
    () => null
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <WeekView
        weekStart={isoDate(weekStart)}
        nowIso={now.toISOString()}
        initialData={initialData}
      />
    </div>
  );
}
