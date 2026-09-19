import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createTask,
  listTasks,
  msftError,
  msftGuard,
  type TaskFilter,
} from "@/lib/todo";

const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  projectId: z.string().optional().nullable(),
  isAstro: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const guard = msftGuard();
  if (guard) return guard;

  const url = new URL(req.url);
  const done = url.searchParams.get("done");
  const due = url.searchParams.get("due"); // 'today' | 'overdue' | 'upcoming'
  const astro = url.searchParams.get("astro");

  const filter: TaskFilter = {};
  if (done !== null) filter.done = done === "true";
  if (astro === "true") filter.astro = true;
  if (due === "today" || due === "overdue" || due === "upcoming")
    filter.due = due;

  try {
    return Response.json(await listTasks(filter));
  } catch (e) {
    return msftError(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = msftGuard();
  if (guard) return guard;

  try {
    const body = createSchema.parse(await req.json());
    const task = await createTask(body);
    return Response.json(task, { status: 201 });
  } catch (e) {
    return msftError(e);
  }
}
