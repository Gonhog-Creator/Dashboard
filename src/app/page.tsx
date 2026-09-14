import { Suspense } from "react";
import { Widget } from "@/components/layout/Widget";
import { Clock } from "@/components/Clock";
import { QuickLinks } from "@/components/QuickLinks";
import { TonightPanel } from "@/components/astro/TonightPanel";
import { TargetList } from "@/components/astro/TargetList";
import { NeedsUpdateList } from "@/components/astro/NeedsUpdateList";
import { AgendaView } from "@/components/calendar/AgendaView";
import { TaskList } from "@/components/tasks/TaskList";

export default function Home() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Widget title="Now" className="xl:col-span-1">
        <Clock />
      </Widget>

      <Widget title="Tonight" className="md:col-span-2">
        <TonightPanel />
      </Widget>

      <Widget title="Agenda">
        <AgendaView days={2} />
      </Widget>

      <Widget title="Tasks">
        <TaskList filter="done=false" emptyText="All clear." />
      </Widget>

      <Widget title="Top targets tonight">
        <Suspense>
          <TargetList limit={8} />
        </Suspense>
      </Widget>

      <Widget title="Needs website update">
        <NeedsUpdateList />
      </Widget>

      <Widget title="Quick links">
        <Suspense>
          <QuickLinks />
        </Suspense>
      </Widget>
    </div>
  );
}
