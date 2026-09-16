import { Widget } from "@/components/layout/Widget";
import { ReportList } from "@/components/reports/ReportList";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Reports</h1>
      <Widget title="Generated reports">
        <ReportList />
      </Widget>
    </div>
  );
}
