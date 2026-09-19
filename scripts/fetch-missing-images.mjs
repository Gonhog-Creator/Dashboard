// One-off patch: fetch the 5 facilities that missed in the main pass.
// Uses page/media-list as a fallback when the summary has no image,
// with generous backoff for upload.wikimedia.org 429s.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/facilities");
const MANIFEST = path.resolve("src/lib/science/facility-images.json");
const UA = { "User-Agent": "personal-dashboard/1.0 (facility images)" };
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MISSING = {
  rubin: ["Vera C. Rubin Observatory", "Large Synoptic Survey Telescope"],
  keck: ["W. M. Keck Observatory", "Mauna Kea Observatories"],
  parkes: ["Parkes Observatory", "Parkes Radio Telescope"],
  superk: ["Super-Kamiokande", "Kamiokande", "Kamioka Observatory"],
  snolab: ["SNOLAB", "Creighton Mine", "Sudbury Neutrino Observatory"],
};

async function api(pathname, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1${pathname}`, {
      signal: AbortSignal.timeout(15_000),
      headers: UA,
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status === 403) {
      await sleep(2500 * (i + 1));
      continue;
    }
    return null;
  }
  return null;
}

async function imageUrlFor(title) {
  const s = await api(`/page/summary/${encodeURIComponent(title)}`);
  const direct = s?.originalimage?.source ?? s?.thumbnail?.source;
  if (direct) return direct;
  // fallback: first raster image in the article's media list
  const ml = await api(`/page/media-list/${encodeURIComponent(title)}`);
  for (const item of ml?.items ?? []) {
    if (item.type === "image" && item.original?.source && !item.original.source.endsWith(".svg")) {
      return item.original.source;
    }
  }
  return null;
}

async function download(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: UA });
    if (res.ok) {
      const ext = EXT[res.headers.get("content-type")] ?? ".jpg";
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length >= 8_000) return { buf, ext };
      return null;
    }
    if (res.status === 429 || res.status === 403) {
      await sleep(3000 * (i + 1));
      continue;
    }
    return null;
  }
  return null;
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
await mkdir(OUT, { recursive: true });

for (const [id, titles] of Object.entries(MISSING)) {
  let done = false;
  for (const title of titles) {
    const url = await imageUrlFor(title);
    if (!url) {
      console.log(`skip  ${id.padEnd(10)} ${title} (no image found)`);
      continue;
    }
    const got = await download(url);
    if (!got) {
      console.log(`skip  ${id.padEnd(10)} ${title} (download failed)`);
      continue;
    }
    const file = `${id}${got.ext}`;
    await writeFile(path.join(OUT, file), got.buf);
    manifest[id] = `/facilities/${file}`;
    console.log(`ok    ${id.padEnd(10)} ${(got.buf.length / 1e3).toFixed(0)}kB  <- ${title}`);
    done = true;
    break;
  }
  if (!done) console.log(`MISS  ${id}`);
  await sleep(800);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest now has ${Object.keys(manifest).length}/32`);
