import { NextRequest } from "next/server";
import { tonightTargets } from "@/lib/astro/visibility";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "25", 10));
  try {
    const targets = await tonightTargets(limit);
    return Response.json({ targets });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
