import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { getFitsScanPath } from "@/lib/settings";

// Resized thumbnails are deterministic per (file, mtime, width) — cache them
// on disk so sharp doesn't re-decode multi-MB finals on every browser miss.
const THUMB_DIR = path.join(os.tmpdir(), "dashboard-thumbs");

function thumbPath(abs: string, w: number, mtimeMs: number, size: number) {
  const key = crypto
    .createHash("sha1")
    .update(`${abs}|${w}|${mtimeMs}|${size}`)
    .digest("hex");
  return path.join(THUMB_DIR, `${key}.jpg`);
}

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
    if (w > 0) {
      const stat = await fs.stat(abs);
      const cachedPath = thumbPath(abs, w, stat.mtimeMs, stat.size);
      try {
        const hit = await fs.readFile(cachedPath);
        return new Response(new Uint8Array(hit), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=86400",
          },
        });
      } catch {
        // cache miss — generate below
      }
      const buf = await fs.readFile(abs);
      const thumb = await sharp(buf)
        .rotate() // honor EXIF orientation
        .resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toBuffer();
      await fs.mkdir(THUMB_DIR, { recursive: true });
      await fs.writeFile(cachedPath, thumb).catch(() => {});
      return new Response(new Uint8Array(thumb), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
    const buf = await fs.readFile(abs);
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
