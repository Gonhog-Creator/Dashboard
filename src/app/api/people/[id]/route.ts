import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { personData, relationshipsFor, toDTO } from "@/lib/people";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().nullish(),
  role: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  location: z.string().nullish(),
  birthday: z.string().nullish(),
  meetUrl: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  notes: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const person = await prisma.person.findUnique({
    where: { id },
    include: { links: { orderBy: { createdAt: "desc" } }, tasks: true },
  });
  if (!person) return Response.json({ error: "not-found" }, { status: 404 });
  const relationships = await relationshipsFor(id);
  return Response.json({
    ...toDTO(person),
    relationships,
    links: person.links,
    tasks: person.tasks,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json());
  const data = personData({ name: body.name ?? "", ...body });
  // personData writes every field — for PATCH drop keys the caller didn't send.
  for (const k of Object.keys(data)) {
    if (!(k in body) && !(body.name && k === "name")) {
      delete (data as Record<string, unknown>)[k];
    }
  }
  if (body.tags !== undefined) data.tags = JSON.stringify(body.tags);
  if (body.customFields !== undefined)
    data.customFields = JSON.stringify(body.customFields);
  try {
    const person = await prisma.person.update({ where: { id }, data });
    return Response.json(toDTO(person));
  } catch {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.person.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
}
