import { Widget } from "@/components/layout/Widget";
import { TonightPanel } from "@/components/astro/TonightPanel";
import { TargetList } from "@/components/astro/TargetList";
import { FitsLibrary } from "@/components/astro/FitsLibrary";
import { NeedsUpdateList } from "@/components/astro/NeedsUpdateList";
import { TaskList } from "@/components/tasks/TaskList";

export default function AstroPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Astrophotography</h1>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Widget title="Tonight's verdict">
          <TonightPanel />
        </Widget>
        <Widget title="Astro todo">
          <TaskList filter="done=false&astro=true" emptyText="No astro tasks." />
        </Widget>
      </div>
      <Widget title="Visible tonight">
        <TargetList limit={25} />
      </Widget>
      <Widget title="Needs website update">
        <NeedsUpdateList />
      </Widget>
      <Widget title="FITS library">
        <FitsLibrary />
      </Widget>
    </div>
  );
}
