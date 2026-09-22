import { getWarAnalytics } from "@/lib/coc/overview";

export const dynamic = "force-dynamic";

/** GET /api/coc/analytics — per-member war performance aggregates. */
export async function GET() {
  return Response.json(await getWarAnalytics());
}
