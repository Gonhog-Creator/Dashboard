import { NextRequest } from "next/server";
import { z } from "zod";
import { markNewsSeen } from "@/lib/science/news";

const schema = z.object({
  facilityId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  await markNewsSeen(parsed.data.facilityId);
  return Response.json({ ok: true });
}
