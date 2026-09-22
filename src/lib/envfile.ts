import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal .env reader/writer. Preserves comments, blank lines, and key
 * order on write; appends new keys at the end; creates the file if missing.
 * Note: Next.js loads env vars at process start — edits require a restart.
 */

const ENV_PATH = path.join(process.cwd(), ".env");

export interface EnvEntry {
  key: string;
  value: string;
}

const KEY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"'))
    return t
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'"))
    return t.slice(1, -1);
  return t;
}

function serialize(v: string): string {
  if (v === "") return "";
  if (/[\n\r]/.test(v))
    return `"${v
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")}"`;
  // Single quotes prevent dotenv-expand from interpolating $VARS.
  if (/\$/.test(v)) return `'${v}'`;
  if (/[\s#"'\\]/.test(v))
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return v;
}

export async function readEnvFile(): Promise<EnvEntry[]> {
  let text: string;
  try {
    text = await readFile(ENV_PATH, "utf8");
  } catch {
    return [];
  }
  const entries: EnvEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(KEY_RE);
    if (m) entries.push({ key: m[1], value: unquote(m[2]) });
  }
  return entries;
}

export async function writeEnvFile(entries: EnvEntry[]): Promise<void> {
  const wanted = new Map(entries.map((e) => [e.key, e.value]));
  let lines: string[] = [];
  try {
    lines = (await readFile(ENV_PATH, "utf8")).split(/\r?\n/);
  } catch {
    // file doesn't exist yet — everything gets appended below
  }

  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(KEY_RE);
    if (!m) {
      out.push(line); // comments / blanks preserved verbatim
      continue;
    }
    const key = m[1];
    if (!wanted.has(key)) continue; // key deleted in the editor
    out.push(`${key}=${serialize(wanted.get(key)!)}`);
    wanted.delete(key);
  }
  for (const [key, value] of wanted) out.push(`${key}=${serialize(value)}`);

  // Trim trailing blank lines, keep a single trailing newline.
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  await writeFile(ENV_PATH, out.join("\n") + "\n", "utf8");
}
