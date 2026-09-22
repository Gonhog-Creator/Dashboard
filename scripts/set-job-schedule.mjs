/** Update a job's persisted cron schedule.
 *  Usage: node scripts/set-job-schedule.mjs <key> <schedule> */
import { DatabaseSync } from "node:sqlite";

const [key, schedule] = process.argv.slice(2);
if (!key || !schedule) {
  console.error("usage: node scripts/set-job-schedule.mjs <key> <schedule>");
  process.exit(1);
}
const db = new DatabaseSync("prisma/dev.db");
db.prepare("UPDATE Job SET schedule = ? WHERE key = ?").run(schedule, key);
console.log(db.prepare("SELECT key, schedule FROM Job").all());
