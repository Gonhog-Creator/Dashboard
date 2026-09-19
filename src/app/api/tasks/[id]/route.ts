import { NextRequest } from "next/server";
import { z } from "zod";
import { deleteTask, msftError, msftGuard, updateTask } from "@/lib/todo";

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
  const guard = msftGuard();
  if (guard) return guard;

  try {
    const { id } = await ctx.params;
    const body = updateSchema.parse(await req.json());
    const task = await updateTask(id, body);
    return Response.json(task);
  } catch (e) {
    return msftError(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = msftGuard();
  if (guard) return guard;

  try {
    const { id } = await ctx.params;
    await deleteTask(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return msftError(e);
  }
}
