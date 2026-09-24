/**
 * One-time sync: mark AstroTarget rows as published when the target already
 * appears on PersonalWebsite (src/data/dsoData.ts). Idempotent — only flips
 * rows where published=0.
 *
 * Usage: node scripts/sync-published.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DSO =
  process.env.PERSONAL_WEBSITE_DSO_FILE ??
  "C:\\Users\\josem\\PycharmProjects\\PersonalWebsite\\src\\data\\dsoData.ts";

// --- Extract published titles from the site's dsoData.ts ---
const text = readFileSync(SITE_DSO, "utf8");
const titles = new Set();
// Escape-aware: 'Bode\'s Galaxy (M81)' must not stop at the escaped quote.
for (const m of text.matchAll(
  /title:\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g
)) {
  titles.add(m[2].trim());
}

// --- Map each title to catalog designators it contains ---
// A title like "Bode's Galaxy (M81) & Cigar Galaxy (M82)" covers BOTH.
const designators = new Set();
const DESIG = /\b(M\s?\d{1,3}|NGC\s?\d{1,4}|IC\s?\d{1,4}|SH\s?2?-?\s?\d{1,3})\b/gi;
for (const t of titles) {
  for (const m of t.matchAll(DESIG)) {
    designators.add(m[1].toUpperCase().replace(/[^A-Z0-9]/g, ""));
  }
  // Non-designator titles kept whole for exact-name matching
  designators.add(t.toUpperCase().replace(/[^A-Z0-9]/g, ""));
}

// Same-image coverage: published shots that depict additional DB targets
const EXTRA = new Map([
  ["NGC2174", ["NGC2175"]], // Monkey Head image file is named NGC2175
  ["NGC2237", ["NGC2244"]], // Rosette Nebula contains the Rosette Cluster
  ["M66", ["NGC3628"]], // Leo Triplet depicts NGC 3628
  ["NGC6992", ["NGC6960"]], // Veil Mosaic covers Western Veil too
]);
// Flame & Horsehead image has no designator in its title
if ([...titles].some((t) => /flame.*horsehead/i.test(t))) {
  designators.add("NGC2024");
  designators.add("IC434");
}
for (const [src, extras] of EXTRA) {
  if (designators.has(src)) for (const e of extras) designators.add(e);
}

// --- Match DB targets ---
const db = new DatabaseSync(join(root, "prisma", "dev.db"));
const targets = db
  .prepare("SELECT id, name, aliases, published FROM AstroTarget")
  .all();

const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const normTitles = [...titles].map(norm);
const PURE_DESIG = /^[A-Z]+\d+$/; // don't substring-match bare designators (M1 vs M101)
const upd = db.prepare(
  "UPDATE AstroTarget SET published=1, updatedAt=CURRENT_TIMESTAMP WHERE id=? AND published=0"
);

const marked = [];
const skipped = [];
for (const t of targets) {
  const keys = [norm(t.name)];
  try {
    for (const a of JSON.parse(t.aliases ?? "[]")) keys.push(norm(a));
  } catch {}
  // also try extracting a designator from the name itself
  const dm = t.name.match(DESIG);
  if (dm) keys.push(norm(dm[0]));

  let hit = keys.find((k) => designators.has(k));
  // Non-designator names ("AE Aurigae", "Markarian's Chain") match when the
  // normalized title contains the normalized target name.
  if (!hit && !PURE_DESIG.test(norm(t.name))) {
    hit = normTitles.find((nt) => nt.includes(norm(t.name)));
  }
  if (hit) {
    if (t.published) skipped.push(t.name);
    else {
      upd.run(t.id);
      marked.push(t.name);
    }
  }
}

console.log(`Site titles: ${titles.size}, designators: ${designators.size}`);
console.log(`Marked published (${marked.length}): ${marked.join(", ")}`);
if (skipped.length)
  console.log(`Already published (${skipped.length}): ${skipped.join(", ")}`);
const remaining = db
  .prepare("SELECT COUNT(*) c FROM AstroTarget WHERE published=0")
  .get();
console.log(`Still unpublished: ${remaining.c}`);
