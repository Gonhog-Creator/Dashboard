import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { msftConfigured } from "@/lib/graph";
import { createTask, listTasks, msftError } from "@/lib/todo";

const createSchema = z.object({
  /** Attach an existing To Do task by composite id, or… */
  taskId: z.string().optional(),
  /** …create a new task with this title (supports "@name" mentions). */
  title: z.string().min(1).optional(),
  dueDate: z.string().datetime().nullish(),
  priority: z.number().int().min(0).max(3).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * Linked tasks with live status from MS To Do. When the integration isn't
 * configured we still return the cached link rows so the UI can show them.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const links = await prisma.personTask.findMany({
    where: { personId: id },
    orderBy: { createdAt: "desc" },
  });
  if (!msftConfigured() || links.length === 0) {
    return Response.json(
      links.map((l) => ({ linkId: l.id, taskId: l.taskId, title: l.title, done: null, dueDate: null }))
    );
  }
  try {
    const tasks = await listTasks();
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return Response.json(
      links.map((l) => {
        const t = byId.get(l.taskId);
        return {
          linkId: l.id,
          taskId: l.taskId,
          title: t?.title ?? l.title,
          done: t?.done ?? null,
          dueDate: t?.dueDate ?? null,
          missing: !t,
        };
      })
    );
  } catch (e) {
    return msftError(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return Response.json({ error: "not-found" }, { status: 404 });
  if (!msftConfigured())
    return Response.json(
      { error: "msft-not-configured", message: "Set MSFT_CLIENT_ID in .env" },
      { status: 503 }
    );

  const body = createSchema.parse(await req.json());
  try {
    let taskId = body.taskId;
    let title = "";
    if (taskId) {
      const tasks = await listTasks();
      title = tasks.find((t) => t.id === taskId)?.title ?? "task";
    } else if (body.title) {
      const task = await createTask({
        title: body.title,
        dueDate: body.dueDate ?? null,
        priority: body.priority,
      });
      taskId = task.id;
      title = task.title;
    } else {
      return Response.json({ error: "taskId-or-title-required" }, { status: 400 });
    }
    const link = await prisma.personTask.create({
      data: { personId: id, taskId, title },
    });
    return Response.json(link, { status: 201 });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("Unique constraint"))
      return Response.json({ error: "already-linked" }, { status: 409 });
    return msftError(e);
  }
}
