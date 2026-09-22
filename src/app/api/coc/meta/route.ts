import { getMeta } from "@/lib/coc/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getMeta());
}
