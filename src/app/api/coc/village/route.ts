import { getSetting } from "@/lib/settings";
import { parseVillage } from "@/lib/coc/village";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await getSetting("coc.villageJson");
  if (!raw) return Response.json({ configured: false });
  try {
    return Response.json({ configured: true, village: parseVillage(raw) });
  } catch {
    return Response.json(
      { configured: true, error: "Failed to parse village JSON — re-copy the export in-game" },
      { status: 400 }
    );
  }
}
