/**
 * Builds src/lib/coc/gamedata.json from ClashKing static_data dumps.
 * Source: https://assets.clashk.ing/static_data/{type}.json
 * Output per id: [name, type, village, reqTH[]] where reqTH[i] = required
 * townhall for level i+1 (empty when not TH-gated).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILES = [
  "buildings",
  "traps",
  "troops",
  "heroes",
  "pets",
  "spells",
  "equipment",
  "obstacles",
  "guardians",
  "helpers",
] as const;

interface CkLevel {
  level: number;
  required_townhall?: number;
}
interface CkItem {
  _id: number;
  name: string;
  type?: string;
  village?: string;
  hero?: string;
  levels?: CkLevel[];
}

const out: Record<string, [string, string, string, number[]]> = {};

for (const f of FILES) {
  const raw = JSON.parse(
    readFileSync(join(tmpdir(), `ck_${f}.json`), "utf8")
  ) as { items: CkItem[] };
  for (const it of raw.items ?? []) {
    const reqTH = (it.levels ?? []).map((l) => l.required_townhall ?? 0);
    out[it._id] = [it.name, it.type ?? f, it.village ?? "home", reqTH];
  }
}

writeFileSync(
  join(__dirname, "../src/lib/coc/gamedata.json"),
  JSON.stringify(out)
);
console.log(`wrote ${Object.keys(out).length} entries`);
