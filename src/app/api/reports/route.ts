import { NextRequest } from "next/server";
import { prisma, ensureWal } from "@/lib/db";

export async function GET(req: NextRequest) {
  await ensureWal();
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20", 10));

  const reports = await prisma.report.findMany({
    where: type ? { type } : undefined,
    orderBy: { generatedAt: "desc" },
    take: limit,
  });
  return Response.json({ reports });
}
