import { prisma } from "@/lib/db";
import { CardDavError, fetchAppleContacts } from "@/lib/contacts/apple";
import { personData } from "@/lib/people";

/**
 * Import iCloud contacts via CardDAV as Person rows. Dedupes on
 * googleResourceName = "carddav:{uid}" — re-running updates existing rows.
 */
export async function POST() {
  try {
    const contacts = await fetchAppleContacts();
    let created = 0;
    let updated = 0;
    for (const c of contacts) {
      const ref = `carddav:${c.uid}`;
      const data = {
        ...personData({
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.company,
          role: c.role,
          location: c.location,
          birthday: c.birthday,
          notes: c.notes,
          avatarUrl: c.avatarUrl,
        }),
        googleResourceName: ref,
      };
      const existing = await prisma.person.findUnique({
        where: { googleResourceName: ref },
      });
      if (existing) {
        await prisma.person.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.person.create({ data });
        created++;
      }
    }
    return Response.json({ created, updated, total: contacts.length });
  } catch (e) {
    if (e instanceof CardDavError)
      return Response.json(
        { error: e.name, message: e.message },
        { status: 502 }
      );
    console.error("[import-apple]", e);
    throw e;
  }
}
