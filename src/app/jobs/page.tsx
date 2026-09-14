import { Widget } from "@/components/layout/Widget";
import { JobPanel } from "@/components/jobs/JobPanel";

export default function JobsPage() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Jobs</h1>
      <Widget title="Scheduled jobs">
        <JobPanel />
      </Widget>
    </div>
  );
}
