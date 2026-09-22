export {};

process.loadEnvFile();

async function main() {
  const { linkFamiliesByLastName } = await import("../src/lib/people");
  const { prisma } = await import("../src/lib/db");

  const result = await linkFamiliesByLastName();
  console.log(
    `families found: ${result.families}, relationships created: ${result.created}`
  );

  // Show the groups for review.
  const rels = await prisma.personRelationship.findMany({
    where: { type: "family" },
    include: { from: { select: { name: true } }, to: { select: { name: true } } },
  });
  for (const r of rels) console.log(`  ${r.from.name} ↔ ${r.to.name}`);

  await prisma.$disconnect();
}

main();
