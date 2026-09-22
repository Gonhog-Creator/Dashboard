import { NextRequest } from "next/server";
import { GoogleScopeError, searchDriveFiles } from "@/lib/google-apis";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json([]);
  try {
    return Response.json(await searchDriveFiles(q));
  } catch (e) {
    if (e instanceof GoogleScopeError)
      return Response.json(
        { error: e.message, message: "Re-login required to grant Drive access" },
        { status: 403 }
      );
    throw e;
  }
}
