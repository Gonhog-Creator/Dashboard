import { pollClan } from "@/lib/coc/sync";
import { registerJob } from "./scheduler";

registerJob({
  key: "coc-poll",
  name: "CoC clan + war poll",
  defaultSchedule: "0 */6 * * *",
  handler: () => pollClan(),
});
