import { getSystemInfo } from "@/lib/system";

export async function GET() {
  return Response.json(await getSystemInfo());
}
