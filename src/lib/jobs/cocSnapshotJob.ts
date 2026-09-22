import { snapshotMembers, syncBattleLogs, syncWarLog, syncRaids } from "@/lib/coc/sync";
import { registerJob } from "./scheduler";

// 06:10 UTC — just after the 05:00 legend-day reset so trophy deltas
// line up with league days. Also backfills war log + raid seasons.
registerJob({
  key: "coc-snapshot",
  name: "CoC daily member snapshots",
  defaultSchedule: "10 6 * * *",
  handler: async () => {
    const parts = [await snapshotMembers()];
    try {
      parts.push(await syncWarLog());
    } catch (e) {
      parts.push(`warlog failed: ${e instanceof Error ? e.message : e}`);
    }
    try {
      parts.push(await syncRaids());
    } catch (e) {
      parts.push(`raids failed: ${e instanceof Error ? e.message : e}`);
    }
    return parts.join(" | ");
  },
});

registerJob({
  key: "coc-battlelog",
  name: "CoC player battle logs",
  defaultSchedule: "7 * * * *",
  handler: () => syncBattleLogs(),
});
