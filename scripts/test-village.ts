import { parseVillage } from "../src/lib/coc/village";

// Synthetic export matching the real format (subset of user's paste).
const sample = {
  tag: "#8R28UG80",
  timestamp: 1789945242,
  helpers: [{ data: 93000000, lvl: 8, helper_cooldown: 46312 }],
  guardians: [{ data: 107000000, lvl: 5 }],
  buildings: [
    { data: 1000001, lvl: 18, cnt: 1 }, // Town Hall
    { data: 1000008, lvl: 20, cnt: 4 }, // Cannon
    { data: 1000008, lvl: 19, cnt: 3, timer: 121761 }, // Cannon upgrading
    { data: 1000010, lvl: 18, cnt: 325 }, // Walls
    { data: 1000004, lvl: 16, cnt: 7 }, // Gold Mine
    { data: 1000000, lvl: 12, cnt: 4 }, // Army Camp
    { data: 1000097, types: [{ data: 103000011, modules: [{ data: 102000033, lvl: 4, timer: 352153 }] }] }, // Crafted Defense
    { data: 1999999, lvl: 1, cnt: 1 }, // unmapped
  ],
  traps: [
    { data: 12000000, lvl: 13, cnt: 7 },
    { data: 12000001, lvl: 5, cnt: 9 },
  ],
  decos: [{ data: 18000000, cnt: 1 }],
  obstacles: [{ data: 8000001, cnt: 12 }, { data: 8000002, cnt: 5 }],
  heroes: [
    { data: 28000000, lvl: 95 },
    { data: 28000001, lvl: 95 },
    { data: 28000006, lvl: 80 },
  ],
  troops: [
    { data: 4000000, lvl: 12 },
    { data: 4000009, lvl: 11 },
    { data: 4000150, lvl: 3 },
  ],
  spells: [{ data: 26000000, lvl: 12 }],
  pets: [{ data: 73000000, lvl: 15 }],
  sieges: [{ data: 4000051, lvl: 5 }],
};

const v = parseVillage(JSON.stringify(sample));
console.log("TH:", v.townHall, "| exported:", v.exportedAt);
console.log("upgrades:", v.upgrades.map((u) => `${u.name}→${u.toLevel}`).join(", "));
console.log("obstacles:", v.obstacles, "| unmapped:", v.unmapped);
for (const c of v.categories) {
  console.log(
    `${c.label.padEnd(14)} ${c.pct ?? "?"}%  (${c.current}/${c.max})  items: ${c.items.length}`
  );
}
const cannon = v.categories.find((c) => c.key === "defenses")?.items.find((i) => i.name === "Cannon");
console.log("cannon icon:", cannon?.icon);
console.log("pekka icon:", v.categories.find((c) => c.key === "troops")?.items.find((i) => i.name === "P.E.K.K.A")?.icon);
