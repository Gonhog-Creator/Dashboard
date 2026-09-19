// Downloads a cover image per facility from Wikipedia (REST summary API ->
// originalimage/thumbnail) into public/facilities/, writes a manifest to
// src/lib/science/facility-images.json. Run: node scripts/fetch-facility-images.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/facilities");
const MANIFEST = path.resolve("src/lib/science/facility-images.json");

// facility id -> candidate Wikipedia article titles (first hit wins)
const FACILITIES = {
  "ligo-hanford": ["LIGO Hanford Observatory", "LIGO"],
  "ligo-livingston": ["LIGO Livingston Observatory", "LIGO"],
  virgo: ["Virgo interferometer"],
  kagra: ["KAGRA"],
  cern: ["Large Hadron Collider", "CERN"],
  fermilab: ["Fermilab"],
  slac: ["SLAC National Accelerator Laboratory"],
  brookhaven: ["Relativistic Heavy Ion Collider", "Brookhaven National Laboratory"],
  rubin: ["Vera C. Rubin Observatory"],
  paranal: ["Paranal Observatory"],
  alma: ["Atacama Large Millimeter Array"],
  keck: ["W. M. Keck Observatory"],
  subaru: ["Subaru Telescope"],
  vla: ["Very Large Array"],
  greenbank: ["Green Bank Telescope"],
  arecibo: ["Arecibo Observatory"],
  fast: ["Five-hundred-meter Aperture Spherical Telescope"],
  parkes: ["Parkes Observatory"],
  jodrell: ["Lovell Telescope", "Jodrell Bank Observatory"],
  effelsberg: ["Effelsberg 100-m Radio Telescope"],
  icecube: ["IceCube Neutrino Observatory", "Amundsen–Scott South Pole Station"],
  superk: ["Super-Kamiokande"],
  snolab: ["SNOLAB", "Sudbury Neutrino Observatory"],
  lngs: ["Laboratori Nazionali del Gran Sasso", "Gran Sasso d'Italia"],
  iter: ["ITER"],
  nif: ["National Ignition Facility"],
  wendelstein: ["Wendelstein 7-X"],
  ksc: ["Kennedy Space Center Launch Complex 39", "Kennedy Space Center"],
  baikonur: ["Baikonur Cosmodrome"],
  guiana: ["Guiana Space Centre"],
  jpl: ["Jet Propulsion Laboratory"],
  skao: ["MeerKAT", "Square Kilometre Array"],
};

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function summary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "personal-dashboard/1.0 (facility images)" },
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

for (const [id, titles] of Object.entries(FACILITIES)) {
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
        headers: { "User-Agent": "personal-dashboard/1.0 (facility images)" },
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
      manifest[id] = `/facilities/${file}`;
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
console.log(`wrote ${MANIFEST} (${Object.keys(manifest).length}/${Object.keys(FACILITIES).length} images)`);
