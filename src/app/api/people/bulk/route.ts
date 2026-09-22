import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { personData } from "@/lib/people";

/**
 * POST /api/people/bulk
 *
 * Mass-create people from a list of names, applying shared fields
 * (location, company, tags) to each. Names that already exist
 * (case-insensitive exact match) are skipped.
 */

const bulkSchema = z.object({
  names: z.array(z.string().min(1)).min(1).max(500),
  location: z.string().nullish(),
  company: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const body = bulkSchema.parse(await req.json());
  const names = [...new Set(body.names.map((n) => n.trim()).filter(Boolean))];

  const existing = await prisma.person.findMany({
    select: { name: true },
  });
  const taken = new Set(existing.map((p) => p.name.toLowerCase()));

  const toCreate = names.filter((n) => !taken.has(n.toLowerCase()));
  const shared = {
    location: body.location ?? null,
    company: body.company ?? null,
    tags: body.tags ?? [],
  };

  await prisma.$transaction(
    toCreate.map((name) =>
      prisma.person.create({ data: personData({ name, ...shared }) })
    )
  );

  return Response.json(
    { created: toCreate.length, skipped: names.length - toCreate.length },
    { status: 201 }
  );
}
