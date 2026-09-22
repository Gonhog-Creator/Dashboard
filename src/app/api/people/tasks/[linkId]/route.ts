import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ linkId: string }> };

/** Unlink a To Do task from a person (does not delete the task itself). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { linkId } = await ctx.params;
  try {
    await prisma.personTask.delete({ where: { id: linkId } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
}
