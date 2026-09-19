import { getNeedsUpdate } from "@/lib/astro/needsUpdate";

export async function GET() {
  return Response.json(await getNeedsUpdate());
}
