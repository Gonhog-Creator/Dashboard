// List decos/obstacles from the stored village export; check CDN icons.
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("prisma/dev.db");
const row = db.prepare("SELECT value FROM Setting WHERE key='coc.villageJson'").get();
if (!row) { console.log("no coc.villageJson"); process.exit(0); }
const raw = JSON.parse(row.value);
const gamedata = JSON.parse(
  await import("node:fs").then((fs) => fs.promises.readFile("src/lib/coc/gamedata.json", "utf8"))
);

const CDN = "https://assets.clashk.ing";
const slugify = (n) =>
  n.toLowerCase().replace(/\./g, "").replace(/ /g, "_").replace(/["?!\\’]/g, "");
const clean = (n) => n.replace(/\\q/g, '"');

// Mirror of EXTRA + ICON_OVERRIDE in village.ts.
Object.assign(gamedata, {
  18000242: ["Emerald Hot Streak", "decorations", "home", []],
  18000243: ["Ultimate Hot Streak", "decorations", "home", []],
  18000244: ["Amber Hot Streak", "decorations", "home", []],
  18000245: ["Violet Hot Streak", "decorations", "home", []],
  18000246: ["Clash Contest", "decorations", "home", []],
  18000247: ["Coin Collector", "decorations", "home", []],
  18000248: ["Sour Elixir Fountain", "decorations", "home", []],
  18000250: ["Portal Staff", "decorations", "home", []],
  8000139: ["Curious Stump", "obstacles", "home", []],
});
const LOCAL = {
  18000246: "/coc/clash_contest.webp",
  18000247: "/coc/coin_collector.webp",
  18000248: "/coc/sour_elixir_fountain.webp",
  18000250: "/coc/portal_staff.webp",
};

for (const key of ["decos", "obstacles"]) {
  const entries = raw[key] ?? [];
  console.log(`\n=== ${key} (${entries.length} entries) ===`);
  for (const e of entries) {
    const g = gamedata[e.data];
    const name = g ? clean(g[0]) : `UNMAPPED ${e.data}`;
    const kind = key === "decos" ? "decorations" : "obstacles";
    const local = LOCAL[e.data];
    const url = local ?? `${CDN}/${kind}/home-village/${slugify(name)}.webp`;
    // Local files: verify on disk instead of HTTP.
    if (url.startsWith("/coc/")) {
      const fs = await import("node:fs");
      const exists = fs.existsSync(`public${url}`);
      console.log(`${e.data} ${name} x${e.cnt ?? 1} -> ${exists ? "200(local)" : "MISSING FILE"} ${url}`);
      continue;
    }
    const res = await fetch(url, { method: "HEAD" });
    console.log(`${e.data} ${name} x${e.cnt ?? 1} -> ${res.status} ${res.status === 200 ? "" : url}`);
  }
}
