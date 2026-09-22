/** One-off/manual CoC sync: war log backfill + clan poll.
 *  Usage: npx tsx scripts/coc-sync.ts */
import { syncWarLog, pollClan, syncRaids } from "../src/lib/coc/sync";

async function main() {
  console.log("warlog:", await syncWarLog());
  console.log("raids:", await syncRaids());
  console.log("poll:", await pollClan());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
