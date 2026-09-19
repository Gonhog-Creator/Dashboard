import { pollScienceNews } from "@/lib/science/news";
import { registerJob } from "./scheduler";

registerJob({
  key: "science-news",
  name: "Poll science facility news feeds",
  defaultSchedule: "*/30 * * * *",
  handler: () => pollScienceNews(),
});
