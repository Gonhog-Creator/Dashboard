import { runJob } from "@/lib/jobs";
import { getLibraryTargets } from "@/lib/astro/library";

export async function GET() {
  return Response.json({ targets: await getLibraryTargets() });
}

export async function POST() {
  const result = await runJob("fits-scan");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
