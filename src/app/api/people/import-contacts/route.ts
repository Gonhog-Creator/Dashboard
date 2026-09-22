import { prisma } from "@/lib/db";
import { fetchGoogleContacts, GoogleScopeError } from "@/lib/google-apis";
import { personData, toDTO } from "@/lib/people";

/**
 * Import Google Contacts as Person rows. Dedupes on googleResourceName —
 * re-running updates existing rows rather than duplicating.
 */
export async function POST() {
  try {
    const contacts = await fetchGoogleContacts();
    let created = 0;
    let updated = 0;
    for (const c of contacts) {
      const data = {
        ...personData({
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.company,
          role: c.role,
          avatarUrl: c.avatarUrl,
        }),
        googleResourceName: c.resourceName,
      };
      const existing = await prisma.person.findUnique({
        where: { googleResourceName: c.resourceName },
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
    if (e instanceof GoogleScopeError)
      return Response.json(
        {
          error: e.message,
          message: "Re-login required to grant Contacts access",
        },
        { status: 403 }
      );
    console.error("[import-contacts]", e);
    return Response.json(
      {
        error: "import-failed",
        message: e instanceof Error ? e.message : "import failed",
      },
      { status: 500 }
    );
  }
}
