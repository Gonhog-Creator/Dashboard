import { getGithubDashboard } from "@/lib/github";

export async function GET() {
  const data = await getGithubDashboard();
  return Response.json(data);
}
