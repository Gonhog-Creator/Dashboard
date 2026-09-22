import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { RELATIONSHIP_TYPES } from "@/lib/people";

const patchSchema = z.object({
  type: z.enum(RELATIONSHIP_TYPES).optional(),
  label: z.string().nullish(),
});

type Ctx = { params: Promise<{ relId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { relId } = await ctx.params;
  const body = patchSchema.parse(await req.json());
  try {
    const rel = await prisma.personRelationship.update({
      where: { id: relId },
      data: { type: body.type, label: body.label },
    });
    return Response.json(rel);
  } catch {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { relId } = await ctx.params;
  try {
    await prisma.personRelationship.delete({ where: { id: relId } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
}
