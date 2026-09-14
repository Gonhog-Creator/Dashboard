import { fetchTonight } from "@/lib/astro/weather";
import { setSetting } from "@/lib/settings";
import { registerJob } from "./scheduler";

registerJob({
  key: "weather",
  name: "Fetch tonight's conditions",
  defaultSchedule: "*/30 * * * *",
  handler: async () => {
    const conditions = await fetchTonight();
    // Cache the result so API reads are instant and survive API outages
    await setSetting("cache.tonight", JSON.stringify(conditions));
    return `verdict=${conditions.verdict.level} score=${conditions.verdict.score} dark=${conditions.darkHours}h`;
  },
});
