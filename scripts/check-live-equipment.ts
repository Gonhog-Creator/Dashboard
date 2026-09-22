import { api, cocConfig } from "../src/lib/coc/client";
import gamedata from "../src/lib/coc/gamedata.json";

async function main() {
  const cfg = await cocConfig();
  if (!cfg.playerTag) {
    console.log("no player tag configured");
    return;
  }
  const known = new Set(Object.values(gamedata).map((v) => (v as unknown[])[0]));
  const p = await api.player(cfg.playerTag);
  for (const e of p.heroEquipment ?? []) {
    if (!known.has(e.name)) console.log("unknown to gamedata:", e.name, e.level, "/", e.maxLevel);
  }
  // also print full list tail for manual id matching
  console.log("total equipment:", p.heroEquipment?.length);
}

main().catch((e) => console.error(e.message));
