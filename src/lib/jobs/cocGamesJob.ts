import { snapshotMembers } from "@/lib/coc/sync";
import { registerJob } from "./scheduler";

// Every 6h on days 22–28 — clan games window. Extra snapshots tighten the
// Games Champion diff so the games tile isn't a full day stale. The daily
// coc-snapshot job still runs regardless.
registerJob({
  key: "coc-games",
  name: "CoC clan games snapshots",
  defaultSchedule: "15 */6 22-28 * *",
  handler: () => snapshotMembers(),
});
