import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ linkId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { linkId } = await ctx.params;
  try {
    await prisma.personLink.delete({ where: { id: linkId } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
}
