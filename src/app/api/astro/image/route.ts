import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { getFitsScanPath } from "@/lib/settings";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** GET /api/astro/image?path=<path relative to FITS scan root> */
export async function GET(req: NextRequest) {
  const rel = req.nextUrl.searchParams.get("path");
  const root = await getFitsScanPath();
  if (!rel || !root) {
    return Response.json({ error: "missing path" }, { status: 400 });
  }

  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    return Response.json({ error: "outside scan root" }, { status: 403 });
  }

  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!mime) {
    return Response.json({ error: "unsupported type" }, { status: 415 });
  }

  const w = Math.min(
    2000,
    Math.max(0, parseInt(req.nextUrl.searchParams.get("w") ?? "0", 10) || 0)
  );

  try {
    const buf = await fs.readFile(abs);
    if (w > 0) {
      const thumb = await sharp(buf)
        .rotate() // honor EXIF orientation
        .resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toBuffer();
      return new Response(new Uint8Array(thumb), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
}
