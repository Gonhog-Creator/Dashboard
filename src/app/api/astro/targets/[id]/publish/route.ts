import { NextRequest } from "next/server";
import { prisma, ensureWal } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await ensureWal();
  const { id } = await ctx.params;
  const target = await prisma.astroTarget.update({
    where: { id },
    data: { published: true },
  });
  return Response.json(target);
}
