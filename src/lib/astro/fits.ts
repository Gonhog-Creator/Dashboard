import { promises as fs } from "fs";
import path from "path";
import type { FitsScanResult, FitsTargetSummary } from "@/types";

const FITS_EXTENSIONS = new Set([".fit", ".fits", ".fts"]);
const HEADER_BLOCK = 2880;
const MAX_HEADER_BLOCKS = 40; // ~115KB — covers any realistic header
const CALIBRATION_TYPES = /dark|flat|bias|offset|calib/i;

interface FitsHeader {
  object?: string;
  dateObs?: string;
  exptime?: number;
  imageTyp?: string;
  filter?: string;
}

/** Parse a FITS header from the first N 2880-byte blocks. Header cards are 80-char ASCII. */
export async function parseFitsHeader(filePath: string): Promise<FitsHeader | null> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(filePath, "r");
    const buf = Buffer.alloc(HEADER_BLOCK * MAX_HEADER_BLOCKS);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    if (bytesRead < HEADER_BLOCK) return null;

    const text = buf.subarray(0, bytesRead).toString("ascii");
    if (!text.startsWith("SIMPLE")) return null;

    const header: FitsHeader = {};
    for (let i = 0; i < text.length; i += 80) {
      const card = text.slice(i, i + 80);
      const key = card.slice(0, 8).trim();
      if (key === "END") break;
      if (card[8] !== "=") continue;
      const raw = card.slice(10, 80).split("/")[0].trim();
      const value = raw.startsWith("'")
        ? raw.slice(1, raw.lastIndexOf("'")).trim()
        : raw;

      switch (key) {
        case "OBJECT":
          header.object = value;
          break;
        case "DATE-OBS":
          header.dateObs = value;
          break;
        case "EXPTIME":
        case "EXPOSURE":
          header.exptime = parseFloat(value) || undefined;
          break;
        case "IMAGETYP":
          header.imageTyp = value;
          break;
        case "FILTER":
          header.filter = value;
          break;
      }
    }
    return header;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

async function* walk(dir: string, errors: string[]): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    errors.push(`${dir}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(p, errors);
    } else if (FITS_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
      yield p;
    }
  }
}

function sessionDate(header: FitsHeader, mtime: Date): string {
  if (header.dateObs) return header.dateObs.slice(0, 10);
  return mtime.toISOString().slice(0, 10);
}

export async function scanFitsLibrary(root: string): Promise<FitsScanResult> {
  const errors: string[] = [];
  const targets = new Map<string, FitsTargetSummary>();
  let fileCount = 0;

  for await (const file of walk(root, errors)) {
    const header = await parseFitsHeader(file);
    if (!header) continue;

    // Skip calibration frames
    if (header.imageTyp && CALIBRATION_TYPES.test(header.imageTyp)) continue;
    if (!header.object) continue;

    fileCount++;
    const stat = await fs.stat(file).catch(() => null);
    const object = header.object.trim();
    const date = sessionDate(header, stat?.mtime ?? new Date());
    const seconds = header.exptime ?? 0;
    const bytes = stat?.size ?? 0;

    let t = targets.get(object);
    if (!t) {
      t = {
        object,
        frames: 0,
        totalSeconds: 0,
        totalBytes: 0,
        sessions: [],
        lastImagedAt: null,
      };
      targets.set(object, t);
    }
    t.frames++;
    t.totalSeconds += seconds;
    t.totalBytes += bytes;
    if (!t.lastImagedAt || date > t.lastImagedAt) t.lastImagedAt = date;

    let s = t.sessions.find((x) => x.date === date && x.path === path.dirname(file));
    if (!s) {
      s = { date, frames: 0, seconds: 0, path: path.dirname(file) };
      t.sessions.push(s);
    }
    s.frames++;
    s.seconds += seconds;
  }

  return {
    scannedAt: new Date().toISOString(),
    root,
    fileCount,
    targets: [...targets.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
    errors,
  };
}
