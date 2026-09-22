import { syncWarLog } from "../src/lib/coc/sync";
import { prisma } from "../src/lib/db";

async function main() {
  console.log(await syncWarLog());
  const wars = await prisma.cocWar.count();
  const attacks = await prisma.cocWarAttack.count();
  console.log(`wars: ${wars}, attacks: ${attacks}`);
}

main().finally(() => prisma.$disconnect());
