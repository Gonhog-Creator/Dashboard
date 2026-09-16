import path from "path";
import fs from "fs/promises";
import { getFitsScanPath, setAstroCover } from "@/lib/settings";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** POST { name, path } — mark a final image as the target's cover. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const rel = typeof body?.path === "string" ? body.path : "";
  if (!name || !rel) {
    return Response.json({ error: "name and path are required" }, { status: 400 });
  }

  const root = await getFitsScanPath();
  if (!root) {
    return Response.json({ error: "scan path not configured" }, { status: 400 });
  }

  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, rel);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    return Response.json({ error: "path outside scan root" }, { status: 403 });
  }
  if (!IMAGE_EXT.has(path.extname(abs).toLowerCase())) {
    return Response.json({ error: "not an image file" }, { status: 400 });
  }
  try {
    await fs.stat(abs);
  } catch {
    return Response.json({ error: "file not found" }, { status: 404 });
  }

  await setAstroCover(name, rel);
  return Response.json({ ok: true });
}
