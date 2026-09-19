// Downloads planet/earth/milky-way textures into public/textures/.
// Sources: Solar System Scope (CC BY 4.0), NASA SVS (public domain),
// three-globe examples (MIT). Run: node scripts/fetch-textures.mjs
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/textures");

const SSS = "https://www.solarsystemscope.com/textures/download";
const TG = "https://unpkg.com/three-globe@2.31.0/example/img";

/** name -> [primary, ...fallbacks] */
const TEXTURES = {
  "earth_day.jpg": [
    `${SSS}/8k_earth_daymap.jpg`,
    `${SSS}/2k_earth_daymap.jpg`,
    `${TG}/earth-blue-marble.jpg`,
  ],
  "earth_night.jpg": [
    `${SSS}/8k_earth_nightmap.jpg`,
    `${SSS}/2k_earth_nightmap.jpg`,
    `${TG}/earth-night.jpg`,
  ],
  "earth_clouds.jpg": [
    `${SSS}/8k_earth_clouds.jpg`,
    `${SSS}/2k_earth_clouds.jpg`,
  ],
  "earth_clouds_alpha.png": [
    "https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png",
  ],
  "milkyway.jpg": [
    `${SSS}/8k_stars_milky_way.jpg`,
    `${SSS}/2k_stars_milky_way.jpg`,
    "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005127/starmap_2020_4k.jpg",
  ],
  "sun.jpg": [`${SSS}/8k_sun.jpg`, `${SSS}/2k_sun.jpg`],
  "mercury.jpg": [`${SSS}/8k_mercury.jpg`, `${SSS}/2k_mercury.jpg`],
  "venus.jpg": [`${SSS}/4k_venus_atmosphere.jpg`, `${SSS}/2k_venus_atmosphere.jpg`],
  "mars.jpg": [`${SSS}/8k_mars.jpg`, `${SSS}/2k_mars.jpg`],
  "jupiter.jpg": [`${SSS}/8k_jupiter.jpg`, `${SSS}/2k_jupiter.jpg`],
  "saturn.jpg": [`${SSS}/8k_saturn.jpg`, `${SSS}/2k_saturn.jpg`],
  "saturn_ring.png": [`${SSS}/8k_saturn_ring_alpha.png`, `${SSS}/2k_saturn_ring_alpha.png`],
  "uranus.jpg": [`${SSS}/2k_uranus.jpg`],
  "neptune.jpg": [`${SSS}/2k_neptune.jpg`],
  "moon.jpg": [`${SSS}/8k_moon.jpg`, `${SSS}/2k_moon.jpg`],
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchOne(name, urls) {
  const dest = path.join(OUT, name);
  if (await exists(dest)) {
    console.log(`skip  ${name} (exists)`);
    return;
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: { "User-Agent": "Mozilla/5.0 dashboard-texture-fetch" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000) throw new Error(`suspiciously small (${buf.length}b)`);
      await writeFile(dest, buf);
      console.log(`ok    ${name}  ${(buf.length / 1e6).toFixed(1)}MB  <- ${url}`);
      return;
    } catch (e) {
      console.log(`fail  ${name}  ${url}  (${e.message})`);
    }
  }
  console.error(`MISSING ${name} — all sources failed`);
}

await mkdir(OUT, { recursive: true });
for (const [name, urls] of Object.entries(TEXTURES)) {
  await fetchOne(name, urls);
}
console.log("done");
