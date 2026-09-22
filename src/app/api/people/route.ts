import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { personData, toDTO } from "@/lib/people";

const createSchema = z.object({
  name: z.string().min(1),
  company: z.string().nullish(),
  role: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  location: z.string().nullish(),
  birthday: z.string().nullish(),
  meetUrl: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  notes: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const company = url.searchParams.get("company")?.trim();
  const tag = url.searchParams.get("tag")?.trim();

  const people = await prisma.person.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q } },
                { company: { contains: q } },
                { role: { contains: q } },
                { email: { contains: q } },
                { location: { contains: q } },
                { notes: { contains: q } },
                { tags: { contains: q } },
              ],
            }
          : {},
        company ? { company: { contains: company } } : {},
        tag ? { tags: { contains: `"${tag}"` } } : {},
      ],
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { links: true, tasks: true } } },
  });

  return Response.json(
    people.map((p) => ({
      ...toDTO(p),
      linkCount: p._count.links,
      taskCount: p._count.tasks,
    }))
  );
}

export async function POST(req: NextRequest) {
  const body = createSchema.parse(await req.json());
  const person = await prisma.person.create({ data: personData(body) });
  return Response.json(toDTO(person), { status: 201 });
}
