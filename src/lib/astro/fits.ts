import { promises as fs } from "fs";
import path from "path";
import type { FitsScanResult, FitsTargetSummary } from "@/types";
import { extractCatalogId, findInCatalog } from "./catalog";

const FITS_EXTENSIONS = new Set([".fit", ".fits", ".fts"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const FINALS_DIR = "Finals";
const HEADER_BLOCK = 2880;
const MAX_HEADER_BLOCKS = 40; // ~115KB — covers any realistic header
const CALIBRATION_TYPES = /dark|flat|bias|offset|calib/i;

// Tokens ignored when matching final-image filenames to targets.
const STOP_TOKENS = new Set([
  "and", "the", "of", "a", "in", "at", "to", "for", "with", "project",
  "compressed", "compression", "cropped", "crop", "full", "final", "finals",
  "wip", "starless", "stars", "colorized", "colour", "color", "total",
  "lightroom", "siril", "sirilled", "unsiril", "pixinsight", "pi", "ps",
  "photoshop", "cosmicclarity", "cosmic", "clarity", "edit", "edited",
  "version", "v", "new", "old", "copy", "print", "web", "jpeg", "jpg",
  "tif", "tiff", "png", "mosaic", "panel", "stack", "stacked", "master",
  "lights", "light", "subs", "sub", "frames", "frame", "data", "raw",
  "calibrated", "output", "process", "processed", "work", "session",
  "m", "ngc", "ic", "sh", "c", "ldn", "lbn", "b", "vdb", "arp", "pgc",
  "hoo", "sho", "soo", "hso", "rgb", "lrgb", "ha", "oiii", "sii", "lp",
  "eagle", "drive", "eagledrive", "bhi", "bald", "head", "island",
]);

// Tokens too common in target names to count as a distinctive single match.
const GENERIC_TOKENS = new Set([
  "nebula", "galaxy", "cluster", "region", "star", "stars", "cloud",
  "north", "south", "east", "west", "northern", "southern", "eastern",
  "western", "great", "little", "big", "upper", "lower", "part",
]);

interface FitsHeader {
  object?: string;
  dateObs?: string;
  exptime?: number;
  imageTyp?: string;
  filter?: string;
}

/** True if a block (multiple of 80-char cards) contains the END card. */
function hasEndCard(text: string): boolean {
  for (let i = 0; i + 80 <= text.length; i += 80) {
    if (text.slice(i, i + 8).trim() === "END") return true;
  }
  return false;
}

/**
 * Parse a FITS header. Reads one 2880-byte block at a time and stops at the
 * END card — most headers are 1-3 blocks, so this avoids reading ~115KB/file.
 */
export async function parseFitsHeader(filePath: string): Promise<FitsHeader | null> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(filePath, "r");
    const block = Buffer.alloc(HEADER_BLOCK);
    let text = "";
    let pos = 0;

    while (pos < HEADER_BLOCK * MAX_HEADER_BLOCKS) {
      const { bytesRead } = await handle.read(block, 0, HEADER_BLOCK, pos);
      if (bytesRead === 0) break;
      const chunk = block.toString("ascii", 0, bytesRead);
      if (pos === 0 && (bytesRead < HEADER_BLOCK || !chunk.startsWith("SIMPLE")))
        return null;
      text += chunk;
      pos += bytesRead;
      if (hasEndCard(chunk) || bytesRead < HEADER_BLOCK) break;
    }

    const header: FitsHeader = {};
    for (let i = 0; i + 80 <= text.length; i += 80) {
      const card = text.slice(i, i + 80);
      const key = card.slice(0, 8).trim();
      if (key === "END") break;
      if (card[8] !== "=") continue;
      const raw = card.slice(10, 80).split("/")[0].trim();
      const value = raw.startsWith("'")
        ? raw.slice(1, raw.lastIndexOf("'")).replace(/''/g, "'").trim()
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

async function* walk(
  dir: string,
  errors: string[],
  extensions: Set<string> = FITS_EXTENSIONS,
  skipDirs?: RegExp
): AsyncGenerator<string> {
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
      if (skipDirs?.test(e.name)) continue;
      yield* walk(p, errors, extensions, skipDirs);
    } else if (extensions.has(path.extname(e.name).toLowerCase())) {
      yield p;
    }
  }
}

const SCAN_CONCURRENCY = 8;
const CACHE_FILE = ".fits-scan-cache.json";

/** Cached per-file parse result — lets rescans skip unchanged files entirely. */
export interface FitsFileEntry {
  mtimeMs: number;
  size: number;
  valid: boolean; // true = counted light frame with an OBJECT
  object?: string;
  dateObs?: string;
  exptime?: number;
  imageTyp?: string;
  filter?: string;
}

async function loadFileCache(root: string): Promise<Map<string, FitsFileEntry>> {
  try {
    const raw = await fs.readFile(path.join(root, CACHE_FILE), "utf8");
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

async function saveFileCache(root: string, files: Map<string, FitsFileEntry>) {
  try {
    const tmp = path.join(root, CACHE_FILE + ".tmp");
    await fs.writeFile(tmp, JSON.stringify(Object.fromEntries(files)));
    await fs.rename(tmp, path.join(root, CACHE_FILE));
  } catch {
    // cache write failure is non-fatal — next scan just re-parses
  }
}

/** Split a name into lowercase word tokens, splitting camelCase ("EasternVeil" -> "eastern veil"). */
function tokenize(name: string): Set<string> {
  const spaced = name
    .replace(/'/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_+&]/g, " ");
  const tokens = spaced
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_TOKENS.has(t) && !/^\d+$/.test(t));
  return new Set(tokens);
}

/** Levenshtein distance <= 1 (handles filename typos like "Cacoon" -> "Cocoon"). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (la > lb) i++;
      else if (lb > la) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

interface TargetAccum {
  object: string;
  aliases: Set<string>;
  dirTokens: Set<string>;
  frames: number;
  totalSeconds: number;
  totalBytes: number;
  sessions: { date: string; frames: number; seconds: number; bytes: number; path: string }[];
  filters: Map<string, { frames: number; seconds: number; exptimes: Map<number, number> }>;
  lastImagedAt: string | null;
}

function modalExptime(exptimes: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [exp, count] of exptimes) {
    if (count > bestCount) {
      best = exp;
      bestCount = count;
    }
  }
  return best;
}

/** Directory segments between the scan root and the file's folder (skips the scope dir). */
function ancestorDirTokens(root: string, filePath: string): Set<string> {
  const rel = path.relative(root, path.dirname(filePath));
  const segments = rel.split(path.sep).filter(Boolean).slice(1); // skip scope dir
  const tokens = new Set<string>();
  for (const seg of segments.slice(0, -1)) {
    // all ancestor dirs except the immediate parent (e.g. "lights")
    for (const t of tokenize(seg)) tokens.add(t);
  }
  return tokens;
}

/**
 * Match a final-image filename to a target. Returns true on a shared catalog
 * designator, >=2 shared tokens, or one distinctive shared/fuzzy token.
 */
function imageMatchesTarget(
  imgTokens: Set<string>,
  imgId: string | null,
  targetTokens: Set<string>,
  targetIds: Set<string>
): boolean {
  if (imgId && targetIds.has(imgId)) return true;

  let shared = 0;
  let nonGeneric = 0;
  let distinctive = false;
  for (const t of imgTokens) {
    if (targetTokens.has(t)) {
      shared++;
      if (!GENERIC_TOKENS.has(t)) {
        nonGeneric++;
        if (t.length >= 5) distinctive = true;
      }
      continue;
    }
    if (t.length >= 5 && !GENERIC_TOKENS.has(t)) {
      for (const tt of targetTokens) {
        if (tt.length >= 5 && withinOneEdit(t, tt)) {
          shared++;
          nonGeneric++;
          distinctive = true;
          break;
        }
      }
    }
  }
  // Require at least one non-generic token so "Star Cluster"-style folder
  // words alone can't produce a match.
  return distinctive || (shared >= 2 && nonGeneric >= 1);
}

export async function scanFitsLibrary(root: string): Promise<FitsScanResult> {
  const errors: string[] = [];
  const targets = new Map<string, TargetAccum>();
  let fileCount = 0;

  // Enumerate first, then parse headers with a small worker pool — sequential
  // open/read/close per file is the bottleneck on large libraries.
  const files: string[] = [];
  for await (const file of walk(root, errors)) files.push(file);

  // Per-file cache: unchanged files (same mtime+size) skip header parsing.
  const cache = await loadFileCache(root);
  const seen = new Map<string, FitsFileEntry>();
  let parsed = 0;

  let next = 0;
  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) continue;

      let entry = cache.get(file);
      if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
        const header = await parseFitsHeader(file);
        parsed++;
        entry = {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          valid:
            !!header?.object &&
            !(header.imageTyp && CALIBRATION_TYPES.test(header.imageTyp)),
          object: header?.object?.trim(),
          dateObs: header?.dateObs,
          exptime: header?.exptime,
          imageTyp: header?.imageTyp,
          filter: header?.filter,
        };
      }
      seen.set(file, entry);
      if (!entry.valid || !entry.object) continue;

      fileCount++;
      const rawObject = entry.object;
      // Merge catalog variants ("M 31", "NGC 224", "Andromeda") into one
      // target; non-catalog names merge on their alphanumeric-normalized key
      // ("Markarian's Chain" == "Markarians Chain").
      const cat = findInCatalog(rawObject);
      const key = cat
        ? cat.name
        : rawObject.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const display = cat?.name ?? rawObject;
      const date = entry.dateObs
        ? entry.dateObs.slice(0, 10)
        : stat.mtime.toISOString().slice(0, 10);
      const seconds = entry.exptime ?? 0;
      const bytes = stat.size;

      let t = targets.get(key);
      if (!t) {
        t = {
          object: display,
          aliases: new Set(),
          dirTokens: new Set(),
          frames: 0,
          totalSeconds: 0,
          totalBytes: 0,
          sessions: [],
          filters: new Map(),
          lastImagedAt: null,
        };
        targets.set(key, t);
      }
      if (rawObject !== t.object) t.aliases.add(rawObject);
      for (const tok of ancestorDirTokens(root, file)) t.dirTokens.add(tok);

      t.frames++;
      t.totalSeconds += seconds;
      t.totalBytes += bytes;
      if (!t.lastImagedAt || date > t.lastImagedAt) t.lastImagedAt = date;

      const filterName = entry.filter?.trim() || "OSC";
      let f = t.filters.get(filterName);
      if (!f) {
        f = { frames: 0, seconds: 0, exptimes: new Map() };
        t.filters.set(filterName, f);
      }
      f.frames++;
      f.seconds += seconds;
      if (seconds > 0) f.exptimes.set(seconds, (f.exptimes.get(seconds) ?? 0) + 1);

      let s = t.sessions.find(
        (x) => x.date === date && x.path === path.dirname(file)
      );
      if (!s) {
        s = { date, frames: 0, seconds: 0, bytes: 0, path: path.dirname(file) };
        t.sessions.push(s);
      }
      s.frames++;
      s.seconds += seconds;
      s.bytes += bytes;
    }
  }
  await Promise.all(
    Array.from({ length: SCAN_CONCURRENCY }, () => worker())
  );

  // Persist the file cache so the next scan only re-parses new/changed files.
  await saveFileCache(root, seen);

  // Match final images (Finals/<scope>/*.jpg etc.) to targets.
  const finalsByTarget = new Map<string, string[]>();
  const finalsRoot = path.join(root, FINALS_DIR);
  const targetKeys = new Map<
    string,
    { tokens: Set<string>; ids: Set<string> }
  >();
  for (const [name, t] of targets) {
    const tokens = new Set<string>([
      ...tokenize(name),
      ...t.dirTokens,
      ...[...t.aliases].flatMap((a) => [...tokenize(a)]),
    ]);
    const ids = new Set<string>();
    for (const key of [name, ...t.aliases]) {
      const id = extractCatalogId(key);
      if (id) ids.add(id);
    }
    const cat = findInCatalog(name);
    if (cat) {
      const id = extractCatalogId(cat.name);
      if (id) ids.add(id);
      for (const a of cat.aliases) {
        for (const tok of tokenize(a)) tokens.add(tok);
        const aid = extractCatalogId(a);
        if (aid) ids.add(aid);
      }
    }
    targetKeys.set(name, { tokens, ids });
  }

  for await (const img of walk(finalsRoot, errors, IMAGE_EXTENSIONS, /timelapse/i)) {
    const rel = path.relative(root, img);
    const base = path.basename(img, path.extname(img));
    const imgTokens = tokenize(base);
    const imgId = extractCatalogId(base);
    for (const [name, keys] of targetKeys) {
      if (imageMatchesTarget(imgTokens, imgId, keys.tokens, keys.ids)) {
        const list = finalsByTarget.get(name) ?? [];
        list.push(rel);
        finalsByTarget.set(name, list);
      }
    }
  }

  const summaries: FitsTargetSummary[] = [...targets.entries()].map(
    ([key, t]) => ({
      object: t.object,
      aliases: [...t.aliases].sort(),
      frames: t.frames,
      totalSeconds: t.totalSeconds,
      totalBytes: t.totalBytes,
      sessions: t.sessions,
      filters: [...t.filters.entries()]
        .map(([filter, f]) => ({
          filter,
          frames: f.frames,
          seconds: f.seconds,
          subSeconds: modalExptime(f.exptimes),
        }))
        .sort((a, b) => b.seconds - a.seconds),
      finals: (finalsByTarget.get(key) ?? []).sort(),
      lastImagedAt: t.lastImagedAt,
    })
  );

  return {
    scannedAt: new Date().toISOString(),
    root,
    fileCount,
    targets: summaries.sort((a, b) => b.totalSeconds - a.totalSeconds),
    errors,
  };
}
