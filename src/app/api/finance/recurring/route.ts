import { prisma, ensureWal } from "@/lib/db";
import { detectRecurring } from "@/lib/finance/recurring";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureWal();
  const streams = await prisma.finRecurringStream.findMany({
    where: { isActive: true },
    orderBy: { nextExpected: "asc" },
    include: { category: { select: { name: true, color: true } } },
  });
  return Response.json({ streams });
}

/** POST — re-run detection over all transactions. */
export async function POST() {
  const message = await detectRecurring();
  return Response.json({ ok: true, message });
}
