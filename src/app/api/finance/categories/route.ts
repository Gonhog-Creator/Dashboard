import { prisma, ensureWal } from "@/lib/db";
import { seedCategories } from "@/lib/finance/categorize";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureWal();
  await seedCategories();
  const categories = await prisma.finCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { transactions: true } } },
  });
  return Response.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      keywords: c.keywords,
      isIncome: c.isIncome,
      transactionCount: c._count.transactions,
    })),
  });
}

export async function POST(request: Request) {
  await ensureWal();
  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) {
    return Response.json({ error: "name required" }, { status: 400 });
  }
  const cat = await prisma.finCategory.create({
    data: {
      name: body.name.trim(),
      color: body.color ?? "#3b82f6",
      keywords: body.keywords ?? null,
      isIncome: body.isIncome ?? false,
    },
  });
  return Response.json(cat, { status: 201 });
}

export async function PUT(request: Request) {
  await ensureWal();
  const body = await request.json().catch(() => null);
  if (!body?.id) return Response.json({ error: "id required" }, { status: 400 });
  const cat = await prisma.finCategory.update({
    where: { id: body.id },
    data: {
      ...(body.name && { name: body.name.trim() }),
      ...(body.color && { color: body.color }),
      ...(body.keywords !== undefined && { keywords: body.keywords }),
      ...(body.isIncome !== undefined && { isIncome: body.isIncome }),
    },
  });
  return Response.json(cat);
}

export async function DELETE(request: Request) {
  await ensureWal();
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.finCategory.delete({ where: { id } });
  return Response.json({ ok: true });
}
