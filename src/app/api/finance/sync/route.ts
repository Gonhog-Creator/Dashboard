import { syncAllItems, plaidConfigured } from "@/lib/finance/plaid";
import { snapshotBalances } from "@/lib/finance/snapshots";
import { refreshCryptoPrices } from "@/lib/finance/crypto";

export const dynamic = "force-dynamic";

/** POST — manual refresh: plaid sync + crypto prices + balance snapshot. */
export async function POST() {
  if (!plaidConfigured()) {
    return Response.json({ ok: false, message: "Plaid not configured" }, { status: 400 });
  }
  const message = await syncAllItems();
  await refreshCryptoPrices().catch(() => {});
  await snapshotBalances().catch(() => {});
  return Response.json({ ok: true, message });
}
