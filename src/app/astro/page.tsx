import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Widget } from "@/components/layout/Widget";
import { TonightPanel } from "@/components/astro/TonightPanel";
import { TargetList } from "@/components/astro/TargetList";
import { FitsLibrary } from "@/components/astro/FitsLibrary";
import { TaskList } from "@/components/tasks/TaskList";

export default function AstroPage() {
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
        <TonightPanel title="Tonight's verdict" />
        <Widget title="Astro todo">
          <TaskList filter="done=false&astro=true" emptyText="No astro tasks." />
        </Widget>
      </div>
      <Widget title="Raw FITS">
        <FitsLibrary />
      </Widget>
      <Widget title="Visible tonight">
        <TargetList limit={5} />
      </Widget>
    </div>
  );
}
