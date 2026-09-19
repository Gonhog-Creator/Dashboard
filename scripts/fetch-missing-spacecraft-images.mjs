// Patch pass: fetch the spacecraft that missed in the main run (429s + juno).
// Uses page/media-list as a fallback when the summary has no image,
// with generous backoff for upload.wikimedia.org 429s.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/spacecraft");
const MANIFEST = path.resolve("src/lib/science/spacecraft-images.json");
const UA = { "User-Agent": "personal-dashboard/1.0 (spacecraft images)" };
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// id -> [wikipedia titles..., nasa search queries]
// pass 2: re-grab the ~20MB orig renditions at ~medium, retry hera
const MISSING = {
  solarorbiter: { wiki: [], nasa: ["Solar Orbiter spacecraft"] },
  lucy: { wiki: [], nasa: ["Lucy spacecraft"] },
  hera: { wiki: [], nasa: ["Hera spacecraft", "Hera mission asteroid", "Hera ESA"] },
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

// NASA images library — different host, not rate-limited like wikimedia
async function nasaImageUrl(queries) {
  for (const query of queries) {
    const res = await fetch(
      `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=5`,
      { signal: AbortSignal.timeout(15_000), headers: UA },
    );
    if (!res.ok) continue;
    const data = await res.json();
    for (const item of data?.collection?.items ?? []) {
      // item.href -> asset manifest json listing renditions
      const m = await fetch(item.href, { signal: AbortSignal.timeout(15_000), headers: UA });
      if (!m.ok) continue;
      const urls = await m.json();
      const jpgs = (Array.isArray(urls) ? urls : []).filter((u) => /\.jpe?g$/i.test(u));
      // prefer ~medium (~300-800kB), then ~large, then anything but ~orig
      const pick =
        jpgs.find((u) => /~medium/i.test(u)) ??
        jpgs.find((u) => /~large/i.test(u)) ??
        jpgs.find((u) => !/~orig/i.test(u)) ??
        null;
      if (pick) return pick.replace(/^http:/, "https:");
    }
  }
  return null;
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
await mkdir(OUT, { recursive: true });

for (const [id, { wiki, nasa }] of Object.entries(MISSING)) {
  let done = false;
  for (const title of wiki) {
    const url = await imageUrlFor(title);
    if (!url) {
      console.log(`skip  ${id.padEnd(14)} ${title} (no image found)`);
      continue;
    }
    const got = await download(url);
    if (!got) {
      console.log(`skip  ${id.padEnd(14)} ${title} (download failed)`);
      continue;
    }
    const file = `${id}${got.ext}`;
    await writeFile(path.join(OUT, file), got.buf);
    manifest[id] = `/spacecraft/${file}`;
    console.log(`ok    ${id.padEnd(14)} ${(got.buf.length / 1e3).toFixed(0)}kB  <- ${title}`);
    done = true;
    break;
  }
  if (!done && nasa.length) {
    const url = await nasaImageUrl(nasa);
    const got = url ? await download(url) : null;
    if (got) {
      const file = `${id}${got.ext}`;
      await writeFile(path.join(OUT, file), got.buf);
      manifest[id] = `/spacecraft/${file}`;
      console.log(`ok    ${id.padEnd(14)} ${(got.buf.length / 1e3).toFixed(0)}kB  <- nasa:${nasa[0]}`);
      done = true;
    } else {
      console.log(`skip  ${id.padEnd(14)} nasa:${nasa[0]} (no image)`);
    }
  }
  if (!done) console.log(`MISS  ${id}`);
  await sleep(800);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest now has ${Object.keys(manifest).length}/24`);
