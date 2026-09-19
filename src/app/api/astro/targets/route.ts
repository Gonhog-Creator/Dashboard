import { NextRequest } from "next/server";
import { getEnrichedTargets } from "@/lib/astro/targets";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "25", 10));
  try {
    return Response.json(await getEnrichedTargets(limit));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
