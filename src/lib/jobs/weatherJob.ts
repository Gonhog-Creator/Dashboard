import { refreshTonight } from "@/lib/astro/weather";
import { registerJob } from "./scheduler";

registerJob({
  key: "weather",
  name: "Fetch tonight's conditions",
  defaultSchedule: "*/30 * * * *",
  handler: async () => {
    // refreshTonight busts the in-memory cache and persists to cache.tonight
    // so API reads are instant and survive API outages.
    const conditions = await refreshTonight();
    return `verdict=${conditions.verdict.level} score=${conditions.verdict.score} dark=${conditions.darkHours}h`;
  },
});
