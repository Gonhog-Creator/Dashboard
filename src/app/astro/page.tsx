import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Widget } from "@/components/layout/Widget";
import { TonightPanel } from "@/components/astro/TonightPanel";
import { TargetList } from "@/components/astro/TargetList";
import { FitsLibrary } from "@/components/astro/FitsLibrary";
import { TaskList } from "@/components/tasks/TaskList";
import { getTonight } from "@/lib/astro/weather";
import { getEnrichedTargets } from "@/lib/astro/targets";
import { getLibraryTargets } from "@/lib/astro/library";
import { listTasks } from "@/lib/todo";

export const dynamic = "force-dynamic";

export default async function AstroPage() {
  // All cached server-side; failures degrade to client-side fetch on mount.
  const [tonight, targets, library, tasks] = await Promise.all([
    getTonight().catch(() => null),
    getEnrichedTargets(5).catch(() => null),
    getLibraryTargets().catch(() => null),
    listTasks({ done: false, astro: true }).catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Astrophotography</h1>
        <a
          href="https://www.astrobin.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink />
          AstroBin
        </a>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TonightPanel title="Tonight's verdict" initialData={tonight} />
        <Widget title="Astro todo">
          <TaskList
            filter="done=false&astro=true"
            emptyText="No astro tasks."
            initialTasks={tasks}
            isAstro
          />
        </Widget>
      </div>
      <Widget title="Raw FITS">
        <FitsLibrary initialTargets={library} />
      </Widget>
      <Widget title="Visible tonight">
        <TargetList limit={5} initialData={targets} />
      </Widget>
    </div>
  );
}
