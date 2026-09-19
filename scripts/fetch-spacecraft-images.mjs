// Downloads a cover image per spacecraft from Wikipedia (REST summary API ->
// originalimage/thumbnail) into public/spacecraft/, writes a manifest to
// src/lib/science/spacecraft-images.json. Run: node scripts/fetch-spacecraft-images.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/spacecraft");
const MANIFEST = path.resolve("src/lib/science/spacecraft-images.json");

// spacecraft id (matches ephemeris.json keys) -> candidate Wikipedia titles
const CRAFT = {
  voyager1: ["Voyager 1"],
  voyager2: ["Voyager 2"],
  pioneer10: ["Pioneer 10"],
  pioneer11: ["Pioneer 11"],
  newhorizons: ["New Horizons"],
  parker: ["Parker Solar Probe"],
  solarorbiter: ["Solar Orbiter"],
  bepicolombo: ["BepiColombo"],
  juice: ["Jupiter Icy Moons Explorer"],
  lucy: ["Lucy (spacecraft)"],
  psyche: ["Psyche (spacecraft)"],
  europaclipper: ["Europa Clipper"],
  osirisapex: ["OSIRIS-REx"],
  cassini: ["Cassini–Huygens", "Cassini-Huygens"],
  juno: ["Juno (spacecraft)"],
  kepler: ["Kepler space telescope"],
  jwst: ["James Webb Space Telescope"],
  gaia: ["Gaia (spacecraft)"],
  soho: ["Solar and Heliospheric Observatory"],
  stereo_a: ["STEREO"],
  hera: ["Hera (space mission)"],
  hayabusa2: ["Hayabusa2"],
  maven: ["MAVEN"],
  dart: ["Double Asteroid Redirection Test"],
};

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function summary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "personal-dashboard/1.0 (spacecraft images)" },
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status === 403) {
      await sleep(2000 * (attempt + 1)); // rate-limited — back off
      continue;
    }
    return null;
  }
  return null;
}

const manifest = {};
await mkdir(OUT, { recursive: true });

for (const [id, titles] of Object.entries(CRAFT)) {
  let done = false;
  for (const title of titles) {
    try {
      const s = await summary(title);
      const img = s?.originalimage?.source ?? s?.thumbnail?.source;
      if (!img) {
        console.log(`skip  ${id.padEnd(16)} ${title} (no image in summary)`);
        continue;
      }
      const res = await fetch(img, {
        signal: AbortSignal.timeout(30_000),
        headers: { "User-Agent": "personal-dashboard/1.0 (spacecraft images)" },
      });
      if (!res.ok) {
        console.log(`skip  ${id.padEnd(16)} ${title} (img HTTP ${res.status})`);
        continue;
      }
      const ext = EXT[res.headers.get("content-type")] ?? ".jpg";
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 8_000) {
        console.log(`skip  ${id.padEnd(16)} ${title} (too small: ${buf.length}b)`);
        continue;
      }
      const file = `${id}${ext}`;
      await writeFile(path.join(OUT, file), buf);
      manifest[id] = `/spacecraft/${file}`;
      console.log(`ok    ${id.padEnd(16)} ${(buf.length / 1e3).toFixed(0)}kB  <- ${title}`);
      done = true;
      break;
    } catch (e) {
      console.log(`fail  ${id.padEnd(16)} ${title} (${e.message.slice(0, 40)})`);
    }
    await sleep(700);
  }
  if (!done) console.log(`MISS  ${id}`);
  await sleep(400);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${MANIFEST} (${Object.keys(manifest).length}/${Object.keys(CRAFT).length} images)`);
