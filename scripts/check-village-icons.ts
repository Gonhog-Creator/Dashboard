import { prisma } from "../src/lib/db";
import { parseVillage } from "../src/lib/coc/village";

async function head(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status;
  } catch {
    return -1;
  }
}

async function main() {
  const s = await prisma.setting.findUnique({ where: { key: "coc.villageJson" } });
  if (!s?.value) {
    console.log("no village json stored");
    return;
  }
  const v = parseVillage(s.value);
  const items = [
    ...v.categories.flatMap((c) => c.items.map((i) => ({ cat: c.key, ...i }))),
    ...v.obstacles.map((i) => ({ cat: "obstacles", ...i })),
  ];
  const bad: { cat: string; name: string; lvl: number; url: string }[] = [];
  for (const it of items) {
    if (!it.icon) {
      bad.push({ cat: it.cat, name: it.name, lvl: it.levels[0] ?? 0, url: "(null)" });
      continue;
    }
    if (it.icon.startsWith("/")) continue; // local override
    const status = await head(it.icon);
    if (status !== 200)
      bad.push({ cat: it.cat, name: it.name, lvl: it.levels[0] ?? 0, url: it.icon });
  }
  console.log(`checked ${items.length} items, ${bad.length} broken:`);
  for (const b of bad) console.log(`  [${b.cat}] ${b.name} lvl${b.lvl} -> ${b.url}`);
}

main().finally(() => prisma.$disconnect());
