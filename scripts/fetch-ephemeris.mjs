// Fetches heliocentric ecliptic J2000 position vectors (AU) from NASA JPL
// Horizons for spacecraft + planets, writes src/lib/science/ephemeris.json.
// No API key needed. Run: node scripts/fetch-ephemeris.mjs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("src/lib/science/ephemeris.json");
const API = "https://ssd.jpl.nasa.gov/api/horizons.api";

const now = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const plusYears = (y) => new Date(now.getTime() + y * 365.25 * 864e5);
const minusYears = (y) => new Date(now.getTime() - y * 365.25 * 864e5);

// Horizons COMMAND ids (negative = spacecraft). span: [start, stop, step]
const SPACECRAFT = [
  { id: "voyager1",     cmd: "-31",  name: "Voyager 1",          agency: "NASA/JPL",   start: "1977-09-05", stop: fmt(plusYears(10)),  step: "30d",  url: "https://science.nasa.gov/mission/voyager/voyager-1/", blurb: "Most distant human-made object; crossed into interstellar space in 2012, still returning data from beyond the heliopause." },
  { id: "voyager2",     cmd: "-32",  name: "Voyager 2",          agency: "NASA/JPL",   start: "1977-08-20", stop: fmt(plusYears(10)),  step: "30d",  url: "https://science.nasa.gov/mission/voyager/voyager-2/", blurb: "Only spacecraft to visit Uranus and Neptune; now in interstellar space on a different trajectory than Voyager 1." },
  { id: "pioneer10",    cmd: "-23",  name: "Pioneer 10",         agency: "NASA/Ames",  start: "1972-03-03", stop: fmt(plusYears(10)),  step: "60d",  url: "https://science.nasa.gov/mission/pioneer-10/", blurb: "First craft through the asteroid belt and past Jupiter. Contact lost 2003; still coasting toward Aldebaran." },
  { id: "pioneer11",    cmd: "-24",  name: "Pioneer 11",         agency: "NASA/Ames",  start: "1973-04-06", stop: fmt(plusYears(10)),  step: "60d",  url: "https://science.nasa.gov/mission/pioneer-11/", blurb: "First Saturn flyby. Silent since 1995, drifting toward the constellation Aquila." },
  { id: "newhorizons",  cmd: "-98",  name: "New Horizons",       agency: "NASA/JHU-APL", start: "2006-01-19", stop: fmt(plusYears(10)), step: "30d",  url: "https://science.nasa.gov/mission/new-horizons/", blurb: "Pluto flyby 2015, Arrokoth 2019. Now exploring the Kuiper Belt from >60 AU out." },
  { id: "parker",       cmd: "-96",  name: "Parker Solar Probe", agency: "NASA/JHU-APL", start: "2018-08-12", stop: fmt(plusYears(3)), step: "2d",   url: "https://science.nasa.gov/mission/parker-solar-probe/", blurb: "Fastest object ever built; repeatedly dives through the Sun's corona inside 0.05 AU." },
  { id: "solarorbiter", cmd: "-144", name: "Solar Orbiter",      agency: "ESA/NASA",   start: "2020-02-10", stop: fmt(plusYears(4)),  step: "4d",   url: "https://www.esa.int/Science_Exploration/Space_Science/Solar_Orbiter", blurb: "Imaging the Sun's poles from increasingly inclined orbits inside Mercury's orbit." },
  { id: "bepicolombo",  cmd: "-76",  name: "BepiColombo",        agency: "ESA/JAXA",   start: "2018-10-20", stop: fmt(plusYears(4)),  step: "5d",   url: "https://www.esa.int/Science_Exploration/Space_Science/BepiColombo", blurb: "Dual orbiters en route to Mercury via nine planetary flybys; orbital insertion late 2026." },
  { id: "juice",        cmd: "-28",  name: "JUICE",              agency: "ESA",        start: "2023-04-14", stop: fmt(plusYears(8)),  step: "10d",  url: "https://www.esa.int/Science_Exploration/Space_Science/Juice", blurb: "Jupiter Icy Moons Explorer — will orbit Ganymede in the 2030s after Earth/Venus gravity assists." },
  { id: "lucy",         cmd: "-49",  name: "Lucy",               agency: "NASA/SwRI",  start: "2021-10-16", stop: fmt(plusYears(9)),  step: "10d",  url: "https://science.nasa.gov/mission/lucy/", blurb: "Touring a record number of Jupiter Trojan asteroids across two swarms through 2033." },
  { id: "psyche",       cmd: "-255", name: "Psyche",             agency: "NASA/JPL",   start: "2023-10-13", stop: fmt(plusYears(6)),  step: "10d",  url: "https://science.nasa.gov/mission/psyche/", blurb: "Heading to metal asteroid 16 Psyche, arriving 2029 — a possible exposed planetary core." },
  { id: "europaclipper",cmd: "-159", name: "Europa Clipper",     agency: "NASA/JPL",   start: "2024-10-14", stop: fmt(plusYears(7)),  step: "10d",  url: "https://science.nasa.gov/mission/europa-clipper/", blurb: "Largest planetary craft NASA has built; Mars gravity assist 2025, Jupiter orbit 2030, then ~50 Europa flybys." },
  { id: "osirisapex",   cmd: "-64",  name: "OSIRIS-APEX",        agency: "NASA/GSFC",  start: "2016-09-08", stop: fmt(plusYears(6)),  step: "10d",  url: "https://science.nasa.gov/mission/osiris-apex/", blurb: "Delivered Bennu samples in 2023; now chasing asteroid Apophis for its 2029 Earth flyby." },
  { id: "cassini",      cmd: "-82",  name: "Cassini",            agency: "NASA/ESA/ASI", start: "1997-10-15", stop: "2017-09-15",     step: "10d",  url: "https://science.nasa.gov/mission/cassini/", blurb: "13 years orbiting Saturn; ended with a deliberate atmospheric plunge in 2017. Trajectory shown for its full mission." },
  { id: "juno",         cmd: "-61",  name: "Juno",               agency: "NASA/JPL",   start: "2011-08-05", stop: fmt(plusYears(2)),  step: "10d",  url: "https://science.nasa.gov/mission/juno/", blurb: "Polar orbiter mapping Jupiter's interior and magnetosphere on elongated 53-day orbits." },
  { id: "kepler",       cmd: "-227", name: "Kepler",             agency: "NASA/Ames",  start: "2009-03-07", stop: fmt(plusYears(5)),  step: "15d",  url: "https://science.nasa.gov/mission/kepler/", blurb: "Planet-hunter that found 2,600+ exoplanets; retired 2018 into an Earth-trailing heliocentric orbit." },
  { id: "jwst",         cmd: "-170", name: "Webb (JWST)",        agency: "NASA/ESA/CSA", start: "2021-12-25", stop: fmt(plusYears(3)), step: "5d",  url: "https://science.nasa.gov/mission/webb/", blurb: "Infrared observatory in a halo orbit around Sun-Earth L2, ~1.5M km from Earth." },
  { id: "gaia",         cmd: "-139479", name: "Gaia",            agency: "ESA",        start: "2013-12-19", stop: fmt(plusYears(2)),  step: "10d",  url: "https://www.esa.int/Science_Exploration/Space_Science/Gaia", blurb: "Mapped 1.8 billion stars from L2; science ops ended Jan 2025, now in a heliocentric retirement orbit." },
  { id: "soho",         cmd: "-21",  name: "SOHO",               agency: "ESA/NASA",   start: "1995-12-02", stop: fmt(plusYears(2)),  step: "15d",  url: "https://soho.nascom.nasa.gov/", blurb: "Solar watchdog at L1 since 1996; discovered 5,000+ comets grazing the Sun." },
  { id: "stereo_a",     cmd: "-234", name: "STEREO-A",           agency: "NASA",       start: "2006-10-26", stop: fmt(plusYears(3)),  step: "15d",  url: "https://science.nasa.gov/mission/stereo/", blurb: "Solar observatory drifting ahead of Earth's orbit, giving stereoscopic views of coronal mass ejections." },
  { id: "hera",         cmd: "-91",  name: "Hera",               agency: "ESA",        start: "2024-10-07", stop: fmt(plusYears(4)),  step: "10d",  url: "https://www.esa.int/Space_Safety/Hera", blurb: "Planetary-defense mission cruising to Dimorphos to survey DART's impact crater (arrival 2026)." },
  { id: "hayabusa2",    cmd: "-37",  name: "Hayabusa2",          agency: "JAXA",       start: "2014-12-03", stop: fmt(plusYears(7)),  step: "15d",  url: "https://www.hayabusa2.jaxa.jp/en/", blurb: "Returned Ryugu samples in 2020; extended mission targets asteroid 1998 KY26 in 2031." },
  { id: "maven",        cmd: "-202", name: "MAVEN",              agency: "NASA/GSFC",  start: "2013-11-18", stop: fmt(plusYears(2)),  step: "10d",  url: "https://science.nasa.gov/mission/maven/", blurb: "Mars orbiter studying atmospheric loss; heliocentric track follows Mars' orbit." },
  { id: "dart",         cmd: "-135", name: "DART",               agency: "NASA/JHU-APL", start: "2021-11-24", stop: "2022-09-26",     step: "2d",   url: "https://science.nasa.gov/mission/dart/", blurb: "First planetary-defense test — deliberately slammed into Dimorphos and changed its orbit. Full mission path shown." },
];

// Planet COMMAND ids (major bodies). One full orbital period sampled.
const PLANETS = [
  { id: "mercury", cmd: "199", name: "Mercury", periodDays: 88,    radius: 0.55, color: "#b5a79a" },
  { id: "venus",   cmd: "299", name: "Venus",   periodDays: 225,   radius: 0.9,  color: "#e8c47e" },
  { id: "earth",   cmd: "399", name: "Earth",   periodDays: 365.25,radius: 0.95, color: "#7fb2e5" },
  { id: "mars",    cmd: "499", name: "Mars",    periodDays: 687,   radius: 0.7,  color: "#e07b53" },
  { id: "jupiter", cmd: "599", name: "Jupiter", periodDays: 4333,  radius: 3.2,  color: "#d8b48f" },
  { id: "saturn",  cmd: "699", name: "Saturn",  periodDays: 10759, radius: 2.7,  color: "#e3cf9e" },
  { id: "uranus",  cmd: "799", name: "Uranus",  periodDays: 30687, radius: 1.7,  color: "#9fd8dd" },
  { id: "neptune", cmd: "899", name: "Neptune", periodDays: 60190, radius: 1.65, color: "#6f8fe8" },
];

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/** Parse Horizons boundary dates like "1977-SEP-05 13:59:24.3830" -> ISO yyyy-mm-dd */
function parseHorizonsDate(s) {
  const m = s.match(/(\d{4})-([A-Z]{3})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]));
  return d.toISOString().slice(0, 10);
}

async function horizonsRaw(cmd, start, stop, step) {
  const params = new URLSearchParams({
    format: "text",
    COMMAND: `'${cmd}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'@10'", // Sun center
    REF_PLANE: "'ECLIPTIC'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'2'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
    CSV_FORMAT: "'YES'",
  });
  const url = `${API}?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function horizons(cmd, start, stop, step) {
  let text = await horizonsRaw(cmd, start, stop, step);
  // Horizons rejects spans outside the ephemeris coverage and tells us the
  // valid boundary — clamp and retry once per side.
  for (let i = 0; i < 3; i++) {
    const prior = text.match(/No ephemeris for target "[^"]*" prior to A\.D\.\s+([^\n]+)/);
    const after = text.match(/No ephemeris for target "[^"]*" after A\.D\.\s+([^\n]+)/);
    if (prior) {
      const d = parseHorizonsDate(prior[1]);
      if (!d) break;
      // +1 day: boundary is a timestamp, our start is midnight — stay inside.
      const bumped = fmt(new Date(new Date(d).getTime() + 864e5));
      if (bumped >= stop) break;
      start = bumped;
    } else if (after) {
      const d = parseHorizonsDate(after[1]);
      if (!d) break;
      const bumped = fmt(new Date(new Date(d).getTime() - 864e5));
      if (bumped <= start) break;
      stop = bumped;
    } else break;
    text = await horizonsRaw(cmd, start, stop, step);
  }
  if (text.includes("API ERROR") || text.includes("Cannot find") || text.includes("No ephemeris")) {
    const m = text.match(/(API ERROR[^\n]*|Cannot find[^\n]*|No ephemeris[^\n]*)/);
    throw new Error(m ? m[1].trim() : "horizons error");
  }
  const soe = text.indexOf("$$SOE");
  const eoe = text.indexOf("$$EOE");
  if (soe < 0 || eoe < 0) throw new Error("no ephemeris block");
  const block = text.slice(soe + 5, eoe);
  const pts = [];
  // CSV_FORMAT=YES gives: JD, cal, X, Y, Z, VX, VY, VZ, LT, RG, RR
  for (const line of block.split("\n")) {
    const cols = line.split(",").map((s) => s.trim());
    if (cols.length < 5) continue;
    const jd = parseFloat(cols[0]);
    const x = parseFloat(cols[2]);
    const y = parseFloat(cols[3]);
    const z = parseFloat(cols[4]);
    if (Number.isFinite(jd) && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      pts.push([+jd.toFixed(4), +x.toFixed(6), +y.toFixed(6), +z.toFixed(6)]);
    }
  }
  if (pts.length < 2) throw new Error(`only ${pts.length} points parsed`);
  return pts;
}

const out = { generatedAt: now.toISOString(), frame: "heliocentric ecliptic J2000, AU", spacecraft: {}, planets: {} };

await mkdir(path.dirname(OUT), { recursive: true });

for (const sc of SPACECRAFT) {
  try {
    const pts = await horizons(sc.cmd, sc.start, sc.stop, sc.step);
    out.spacecraft[sc.id] = { name: sc.name, agency: sc.agency, url: sc.url, blurb: sc.blurb, points: pts };
    console.log(`ok    ${sc.id.padEnd(14)} ${pts.length} pts`);
  } catch (e) {
    console.log(`FAIL  ${sc.id.padEnd(14)} ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 400)); // be polite to the API
}

for (const p of PLANETS) {
  try {
    const spanDays = p.periodDays * 1.08;
    const start = fmt(new Date(now.getTime() - spanDays * 0.55 * 864e5));
    const stop = fmt(new Date(now.getTime() + spanDays * 0.55 * 864e5));
    const stepDays = Math.max(0.5, spanDays / 420);
    const step = stepDays < 1 ? `${Math.round(stepDays * 24)}h` : `${Math.round(stepDays)}d`;
    const pts = await horizons(p.cmd, start, stop, step);
    out.planets[p.id] = { name: p.name, radius: p.radius, color: p.color, periodDays: p.periodDays, points: pts };
    console.log(`ok    ${p.id.padEnd(14)} ${pts.length} pts`);
  } catch (e) {
    console.log(`FAIL  ${p.id.padEnd(14)} ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

await writeFile(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} (${(JSON.stringify(out).length / 1e6).toFixed(2)}MB)`);
