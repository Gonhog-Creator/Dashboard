import { NextRequest } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/settings";

const updateSchema = z.record(z.string(), z.string());

export async function GET() {
  const settings = await getAllSettings();
  // Never expose secrets through the API
  delete settings["cache.tonight"];
  for (const key of Object.keys(settings)) {
    if (key.startsWith("msft.")) delete settings[key];
  }
  return Response.json(settings);
}

export async function PATCH(req: NextRequest) {
  const body = updateSchema.parse(await req.json());
  for (const [key, value] of Object.entries(body)) {
    await setSetting(key, value);
  }
  return Response.json({ ok: true });
}
