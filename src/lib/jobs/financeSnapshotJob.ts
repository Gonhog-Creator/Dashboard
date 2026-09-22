import { snapshotBalances } from "@/lib/finance/snapshots";
import { detectRecurring } from "@/lib/finance/recurring";
import { refreshCryptoPrices } from "@/lib/finance/crypto";
import { registerJob } from "./scheduler";

registerJob({
  key: "finance-snapshot",
  name: "Daily balance snapshot + recurring detection",
  defaultSchedule: "55 23 * * *", // 11:55pm daily
  handler: async () => {
    const crypto = await refreshCryptoPrices().catch(() => "crypto skipped");
    const snap = await snapshotBalances();
    const rec = await detectRecurring().catch(() => "recurring skipped");
    return `${crypto}; ${snap}; ${rec}`;
  },
});
