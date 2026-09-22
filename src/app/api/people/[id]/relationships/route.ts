import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { RELATIONSHIP_TYPES, relationshipsFor } from "@/lib/people";

const createSchema = z.object({
  toId: z.string().min(1),
  type: z.enum(RELATIONSHIP_TYPES),
  label: z.string().nullish(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return Response.json(await relationshipsFor(id));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = createSchema.parse(await req.json());
  if (body.toId === id)
    return Response.json({ error: "self-relationship" }, { status: 400 });
  try {
    await prisma.personRelationship.create({
      data: { fromId: id, toId: body.toId, type: body.type, label: body.label ?? null },
    });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("Unique constraint"))
      return Response.json({ error: "duplicate" }, { status: 409 });
    if (msg.includes("Foreign key"))
      return Response.json({ error: "not-found" }, { status: 404 });
    throw e;
  }
  return Response.json(await relationshipsFor(id), { status: 201 });
}
