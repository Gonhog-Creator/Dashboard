import { prisma, ensureWal } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureWal();
  const institutions = await prisma.finInstitution.findMany({
    include: {
      plaidItem: { select: { status: true, createdAt: true } },
      accounts: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { transactions: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return Response.json({
    institutions: institutions.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      portalUrl: i.portalUrl,
      plaidStatus: i.plaidItem?.status ?? null,
      connectedAt: i.plaidItem?.createdAt ?? null,
      accounts: i.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        currency: a.currency,
        currentBalance: a.currentBalance,
        balanceUpdatedAt: a.balanceUpdatedAt,
        transactionCount: a._count.transactions,
      })),
    })),
  });
}
