/**
 * Build the Barbeito family tree: merge duplicate contacts, create missing
 * people, and replace generic "family" clique edges with typed
 * spouse/parent/sibling relationships.
 *
 * Usage: npx tsx scripts/barbeito-tree.ts
 */
export {};

process.loadEnvFile();

const ID = {
  mima: "cmucuvmga0058ur1so25vz5vd", // -> Graciela (Mima) Barbeito
  luli: "cmucuvmis006uur1sti7ynnzr",
  severiano: "cmucuvmlx008tur1sfw8t4ecu",
  santiagoDup: "cmucuvmm2008wur1sbcu3psix", // empty record -> merge into santiago
  pedro: "cmucuvmmm0099ur1sywaummf3",
  trini: "cmucuvmn8009lur1s2mkd906t",
  jazmin: "cmucuvms000clur1sx4adt7jc",
  fatato: "cmucuvmso00d1ur1sr4qa0tnr", // dup of mono (same email) -> merge
  mono: "cmucuvmtb00dfur1sn04hc51m",
  mariano: "cmucuvn0j00gmur1sp0269rqn",
  chubi: "cmucuvn1300gzur1sea3zf4pb",
  hope: "cmucuvn2w00i4ur1sz9u9ak65",
  benjamin: "cmucuvn2y00i5ur1s36xnj6lz",
  fernando: "cmucuvn6n00kiur1sd8br94qy",
  santiago: "cmucuvn6u00knur1s7zgsyy0s", // santi.barbeito@icloud.com
  joseMaria: "cmucuvn7p00l5ur1ssak9zulj", // the user
  atilioDup: "cmucuvn8d00lkur1sihixmybm", // notes:"no", same phone as M.D. -> merge
  dad: "cmucuvnba00n5ur1stlrnrhp4", // "Atilio Barbeito M.D."
  atilioSr: "cmucuvnd400o4ur1stcl02bie", // no contact info -> the elder
};

async function main() {
  const { prisma } = await import("../src/lib/db");

  // ---------- 1. merge duplicate people ----------
  async function mergePerson(dupId: string, keepId: string) {
    // Move relationships, skipping ones that would violate the unique key.
    const rels = await prisma.personRelationship.findMany({
      where: { OR: [{ fromId: dupId }, { toId: dupId }] },
    });
    for (const r of rels) {
      const fromId = r.fromId === dupId ? keepId : r.fromId;
      const toId = r.toId === dupId ? keepId : r.toId;
      if (fromId === toId) {
        await prisma.personRelationship.delete({ where: { id: r.id } });
        continue;
      }
      const clash = await prisma.personRelationship.findFirst({
        where: { fromId, toId, type: r.type },
      });
      if (clash) await prisma.personRelationship.delete({ where: { id: r.id } });
      else
        await prisma.personRelationship.update({
          where: { id: r.id },
          data: { fromId, toId },
        });
    }
    await prisma.personLink.updateMany({
      where: { personId: dupId },
      data: { personId: keepId },
    });
    await prisma.personTask.updateMany({
      where: { personId: dupId },
      data: { personId: keepId },
    });
    await prisma.person.delete({ where: { id: dupId } });
  }

  await mergePerson(ID.fatato, ID.mono);
  await mergePerson(ID.atilioDup, ID.dad);
  await mergePerson(ID.santiagoDup, ID.santiago);
  console.log("merged Fatato->Mono, Atilio(dup)->Atilio M.D., Santiago(dup)->Santiago");

  // Mima is Graciela (gbarbeito@gmail.com) — keep the nickname in the name.
  await prisma.person.update({
    where: { id: ID.mima },
    data: { name: "Graciela (Mima) Barbeito" },
  });

  // ---------- 2. create missing people ----------
  async function ensurePerson(name: string): Promise<string> {
    const found = await prisma.person.findFirst({
      where: { name: { equals: name } },
    });
    if (found) return found.id;
    const created = await prisma.person.create({ data: { name } });
    console.log("created", name);
    return created.id;
  }

  const luz = await ensurePerson("Luz Barbeito");
  const solano = await ensurePerson("Solano Barbeito");
  const fransisca = await ensurePerson("Fransisca Barbeito");
  const ana = await ensurePerson("Ana Barbeito");
  const lorenzo = await ensurePerson("Lorenzo Barbeito");

  // ---------- 3. typed relationships ----------
  const SYMMETRIC = new Set(["spouse", "sibling", "family"]);
  let added = 0;

  async function addRel(fromId: string, toId: string, type: string) {
    if (fromId === toId) return;
    const exists = await prisma.personRelationship.findFirst({
      where: SYMMETRIC.has(type)
        ? {
            type,
            OR: [
              { fromId, toId },
              { fromId: toId, toId: fromId },
            ],
          }
        : { fromId, toId, type },
    });
    if (exists) return;
    await prisma.personRelationship.create({ data: { fromId, toId, type } });
    added++;
  }

  const spouse = (a: string, b: string) => addRel(a, b, "spouse");
  const parent = (child: string, par: string) => addRel(child, par, "parent");
  const siblings = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        await addRel(ids[i], ids[j], "sibling");
  };

  // spouses
  await spouse(ID.dad, luz); // Atilio & Luz (parents)
  await spouse(ID.mono, ID.luli); // Mono & Luli
  await spouse(ID.mariano, ana); // Mariano & Ana
  await spouse(ID.atilioSr, ID.mima); // Atilio Sr & Graciela

  // user's generation -> dad + Luz
  const userGen = [ID.joseMaria, solano, ID.benjamin, ID.santiago, fransisca];
  for (const c of userGen) {
    await parent(c, ID.dad);
    await parent(c, luz);
  }
  await siblings(userGen);

  // dad's generation -> Atilio Sr + Graciela
  const dadGen = [ID.dad, ID.mono, ID.mariano];
  for (const c of dadGen) {
    await parent(c, ID.atilioSr);
    await parent(c, ID.mima);
  }
  await siblings(dadGen);

  // Mono's children -> Mono + Luli
  const monoKids = [ID.jazmin, ID.severiano, ID.trini];
  for (const c of monoKids) {
    await parent(c, ID.mono);
    await parent(c, ID.luli);
  }
  await siblings(monoKids);

  // Mariano's children -> Mariano + Ana
  const marianoKids = [ID.hope, lorenzo];
  for (const c of marianoKids) {
    await parent(c, ID.mariano);
    await parent(c, ana);
  }
  await siblings(marianoKids);

  console.log("typed relationships added:", added);

  // ---------- 4. drop "family" edges superseded by a typed rel ----------
  const rels = await prisma.personRelationship.findMany();
  const typedPairs = new Set(
    rels.filter((r) => r.type !== "family").map((r) => [r.fromId, r.toId].sort().join("|"))
  );
  const stale = rels.filter(
    (r) => r.type === "family" && typedPairs.has([r.fromId, r.toId].sort().join("|"))
  );
  if (stale.length)
    await prisma.personRelationship.deleteMany({
      where: { id: { in: stale.map((r) => r.id) } },
    });
  console.log("superseded family edges removed:", stale.length);

  await prisma.$disconnect();
}

main();
