import { prisma, ensureWal } from "@/lib/db";
import { runJob } from "@/lib/jobs";

export async function GET() {
  await ensureWal();
  const targets = await prisma.astroTarget.findMany({
    orderBy: { totalSeconds: "desc" },
    include: { sessions: { orderBy: { date: "desc" } } },
  });
  return Response.json({ targets });
}

export async function POST() {
  const result = await runJob("fits-scan");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
