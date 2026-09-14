import { NextRequest } from "next/server";
import { prisma, ensureWal } from "@/lib/db";
import { runJob } from "@/lib/jobs";

export async function GET() {
  await ensureWal();
  const jobs = await prisma.job.findMany({
    orderBy: { key: "asc" },
    include: {
      runs: { orderBy: { startedAt: "desc" }, take: 5 },
    },
  });
  return Response.json({ jobs });
}

export async function POST(req: NextRequest) {
  const { key } = (await req.json()) as { key?: string };
  if (!key) return Response.json({ error: "missing key" }, { status: 400 });
  const result = await runJob(key);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
