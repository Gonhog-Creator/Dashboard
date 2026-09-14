import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, ensureWal } from "@/lib/db";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  done: z.boolean().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  projectId: z.string().nullable().optional(),
  isAstro: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await ensureWal();
  const { id } = await ctx.params;
  const body = updateSchema.parse(await req.json());

  const data: Record<string, unknown> = { ...body };
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.done !== undefined) {
    data.completedAt = body.done ? new Date() : null;
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: { project: true },
  });
  return Response.json(task);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  await ensureWal();
  const { id } = await ctx.params;
  await prisma.task.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
