import { NextRequest } from "next/server";
import { graphData } from "@/lib/people";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const companyEdges = url.searchParams.get("companyEdges") !== "false";
  return Response.json(await graphData(companyEdges));
}
