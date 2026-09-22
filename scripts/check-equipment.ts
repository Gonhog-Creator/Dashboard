import { prisma } from "../src/lib/db";
import gamedata from "../src/lib/coc/gamedata.json";

async function main() {
  const known = new Set(Object.values(gamedata).map((v) => (v as unknown[])[0]));
  const snaps = await prisma.cocPlayerSnapshot.findMany({
    where: { heroEquipment: { not: null } },
    orderBy: { ts: "desc" },
    take: 5,
    select: { playerTag: true, heroEquipment: true },
  });
  for (const s of snaps) {
    const eq = JSON.parse(s.heroEquipment!) as { name: string; level: number; maxLevel: number }[];
    const missing = eq.filter((e) => !known.has(e.name));
    if (missing.length)
      console.log(s.playerTag, missing.map((e) => `${e.name} (${e.level}/${e.maxLevel})`).join(", "));
  }
  console.log("done");
}

main().finally(() => prisma.$disconnect());
