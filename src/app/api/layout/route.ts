import { NextRequest } from "next/server";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/settings";

const KEY = "dashboard.layout.v2";

const itemSchema = z.object({
  i: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

const layoutSchema = z.object({
  cols: z.number().int().min(1).max(12),
  items: z.array(itemSchema).max(50),
});

export async function GET() {
  const raw = await getSetting(KEY);
  if (!raw) return Response.json(null);
  try {
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json(null);
  }
}

export async function PUT(req: NextRequest) {
  const parsed = layoutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid layout" }, { status: 400 });
  }
  await setSetting(KEY, JSON.stringify(parsed.data));
  return Response.json({ ok: true });
}
