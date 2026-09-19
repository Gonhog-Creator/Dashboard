import { Widget } from "@/components/layout/Widget";
import { ReportList } from "@/components/reports/ReportList";
import { prisma, ensureWal } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await ensureWal();
  const reports = await prisma.report
    .findMany({ orderBy: { generatedAt: "desc" }, take: 20 })
    .then((rs) =>
      rs.map((r) => ({ ...r, generatedAt: r.generatedAt.toISOString() }))
    )
    .catch(() => null);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Reports</h1>
      <Widget title="Generated reports">
        <ReportList initialReports={reports} />
      </Widget>
    </div>
  );
}
