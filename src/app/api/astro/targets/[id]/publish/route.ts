import { NextRequest } from "next/server";
import { prisma, ensureWal } from "@/lib/db";
import { bustNeedsUpdate } from "@/lib/astro/needsUpdate";

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
  bustNeedsUpdate();
  return Response.json(target);
}
