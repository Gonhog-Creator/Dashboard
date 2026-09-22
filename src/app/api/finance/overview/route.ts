import { getFinanceOverview } from "@/lib/finance/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getFinanceOverview());
}
