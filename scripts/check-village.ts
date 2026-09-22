import { prisma } from "../src/lib/db";
import { parseVillage } from "../src/lib/coc/village";

async function main() {
  const raw = await prisma.setting.findUnique({ where: { key: "coc.villageJson" } });
  if (!raw?.value) {
    console.log("no villageJson stored");
    return;
  }
  const parsed = JSON.parse(raw.value);
  console.log("top-level keys:", Object.keys(parsed).join(", "));
  console.log("heroes[0..2]:", JSON.stringify(parsed.heroes?.slice(0, 3)));
  console.log("equipment[0..2]:", JSON.stringify(parsed.equipment?.slice(0, 3)));
  const mini = parseVillage(
    JSON.stringify({
      buildings: [{ data: 1000001, lvl: 18 }],
      heroes: [{ data: 28000000, lvl: 110 }],
      equipment: [{ data: 90000000, lvl: 18 }],
    })
  );
  console.log("mini categories:", mini.categories.map((c) => `${c.key}(${c.items.length})`).join(", "));
  console.log("mini unmapped:", mini.unmapped, "| mini full:", JSON.stringify(mini.categories).slice(0, 400));
  const v = parseVillage(raw.value);
  console.log("TH:", v.townHall, "| unmapped:", v.unmapped);
  console.log("category keys:", v.categories.map((c) => c.key).join(", "));
  console.log("obstacles:", v.obstacles.length, "items");
  for (const c of v.categories) {
    console.log(`${c.label.padEnd(14)} ${c.pct ?? "?"}%  items: ${c.items.map((i) => i.name).join(", ")}`);
  }
}

main().finally(() => prisma.$disconnect());
