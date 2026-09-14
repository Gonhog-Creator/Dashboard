import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, ensureWal } from "@/lib/db";

const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  projectId: z.string().optional().nullable(),
  isAstro: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  await ensureWal();
  const url = new URL(req.url);
  const done = url.searchParams.get("done");
  const due = url.searchParams.get("due"); // 'today' | 'overdue' | 'upcoming'
  const astro = url.searchParams.get("astro");

  const where: Record<string, unknown> = {};
  if (done !== null) where.done = done === "true";
  if (astro === "true") where.isAstro = true;

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (due === "today") where.dueDate = { lte: endOfToday };
  if (due === "overdue") where.dueDate = { lt: now };
  if (due === "upcoming") where.dueDate = { gt: endOfToday };

  const tasks = await prisma.task.findMany({
    where,
    include: { project: true },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }, { priority: "desc" }],
  });
  return Response.json(tasks);
}

export async function POST(req: NextRequest) {
  await ensureWal();
  const body = createSchema.parse(await req.json());
  const task = await prisma.task.create({
    data: {
      title: body.title,
      notes: body.notes,
      priority: body.priority ?? 0,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      projectId: body.projectId ?? null,
      isAstro: body.isAstro ?? false,
    },
    include: { project: true },
  });
  return Response.json(task, { status: 201 });
}
