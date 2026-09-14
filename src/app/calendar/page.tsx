import { Widget } from "@/components/layout/Widget";
import { AgendaView } from "@/components/calendar/AgendaView";

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <Widget title="Next 7 days">
        <AgendaView days={7} />
      </Widget>
    </div>
  );
}
