import { snapshotMembers } from "../src/lib/coc/sync";
snapshotMembers().then(console.log).catch((e) => {
  console.error(e);
  process.exit(1);
});
