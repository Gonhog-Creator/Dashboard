import { syncRaids } from "@/lib/coc/sync";
import { syncMeta } from "@/lib/coc/meta";
import { registerJob } from "./scheduler";

registerJob({
  key: "coc-raids",
  name: "CoC capital raid seasons",
  defaultSchedule: "25 */6 * * *",
  handler: () => syncRaids(),
});

// 06:45 UTC — after War Report's 06:00 battle-stats snapshot is published.
registerJob({
  key: "coc-meta",
  name: "CoC legend meta snapshot (War Report)",
  defaultSchedule: "45 6 * * *",
  handler: () => syncMeta(),
});
