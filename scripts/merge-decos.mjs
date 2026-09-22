/** Merge ClashKing decorations into gamedata.json as [name,"decoration",village,[]].
 *  Usage: node scripts/merge-decos.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const res = await fetch(
  "https://assets.clashk.ing/static_data/decorations.json"
);
const { items } = await res.json();

const path = "src/lib/coc/gamedata.json";
const data = JSON.parse(readFileSync(path, "utf8"));
let added = 0;
for (const it of items) {
  if (data[it._id]) continue;
  data[it._id] = [it.name, "decoration", it.village ?? "home", []];
  added++;
}
writeFileSync(path, JSON.stringify(data));
console.log(`added ${added} decorations (${items.length} total)`);
