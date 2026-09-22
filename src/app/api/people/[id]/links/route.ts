import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  kind: z.enum(["drive", "url"]).default("url"),
  fileId: z.string().nullish(),
  mimeType: z.string().nullish(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = createSchema.parse(await req.json());
  try {
    const link = await prisma.personLink.create({
      data: {
        personId: id,
        title: body.title,
        url: body.url,
        kind: body.kind,
        fileId: body.fileId ?? null,
        mimeType: body.mimeType ?? null,
      },
    });
    return Response.json(link, { status: 201 });
  } catch {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
}
