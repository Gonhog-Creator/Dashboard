import { getCwlSeason } from "@/lib/coc/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getCwlSeason());
}
