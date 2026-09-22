import { syncAllItems } from "@/lib/finance/plaid";
import { registerJob } from "./scheduler";

registerJob({
  key: "finance-sync",
  name: "Sync Plaid transactions + balances",
  defaultSchedule: "17 */4 * * *", // every 4h, off the hour
  handler: () => syncAllItems(),
});
