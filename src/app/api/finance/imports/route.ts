import { prisma, ensureWal } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureWal();
  const imports = await prisma.finImport.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 100,
    include: { account: { select: { name: true } } },
  });
  return Response.json({ imports });
}

/** DELETE ?id= — removes the import record AND its transactions. */
export async function DELETE(request: Request) {
  await ensureWal();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.$transaction([
    prisma.finTransaction.deleteMany({ where: { importId: id } }),
    prisma.finImport.delete({ where: { id } }),
  ]);
  return Response.json({ ok: true });
}
