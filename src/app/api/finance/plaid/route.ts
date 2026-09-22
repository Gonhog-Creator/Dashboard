import { prisma, ensureWal } from "@/lib/db";
import { plaidConfigured, plaidClient } from "@/lib/finance/plaid";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureWal();
  const items = await prisma.plaidItem.findMany({
    include: { institution: { select: { name: true, portalUrl: true } } },
  });
  return Response.json({
    configured: plaidConfigured(),
    env: process.env.PLAID_ENV ?? "sandbox",
    items: items.map((i) => ({
      itemId: i.itemId,
      institution: i.institution.name,
      portalUrl: i.institution.portalUrl,
      status: i.status,
      connectedAt: i.createdAt,
    })),
  });
}

/** DELETE ?itemId= — disconnect an institution (keeps imported data). */
export async function DELETE(request: Request) {
  await ensureWal();
  const itemId = new URL(request.url).searchParams.get("itemId");
  if (!itemId) return Response.json({ error: "itemId required" }, { status: 400 });
  const item = await prisma.plaidItem.findUnique({ where: { itemId } });
  if (!item) return Response.json({ error: "not found" }, { status: 404 });
  try {
    if (plaidConfigured()) {
      await plaidClient().itemRemove({ access_token: item.accessToken });
    }
  } catch (e) {
    console.warn("[plaid] itemRemove failed — deleting locally anyway", e);
  }
  await prisma.plaidItem.delete({ where: { itemId } });
  return Response.json({ ok: true });
}
