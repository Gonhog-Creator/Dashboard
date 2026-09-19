// Typed access to the baked JPL Horizons ephemeris (scripts/fetch-ephemeris.mjs).
// Coordinates: heliocentric ecliptic J2000, AU. points: [jd, x, y, z][]
import raw from "./ephemeris.json";

export type EphPoint = [number, number, number, number];

export interface SpacecraftEph {
  name: string;
  agency: string;
  url: string;
  blurb: string;
  points: EphPoint[];
}

export interface PlanetEph {
  name: string;
  radius: number; // scene units (exaggerated for visibility)
  color: string;
  periodDays: number;
  points: EphPoint[];
}

interface EphFile {
  generatedAt: string;
  frame: string;
  spacecraft: Record<string, SpacecraftEph>;
  planets: Record<string, PlanetEph>;
}

export const EPHEMERIS = raw as unknown as EphFile;

/** Julian Date for a JS Date. */
export function toJD(d: Date | number): number {
  const t = typeof d === "number" ? d : d.getTime();
  return t / 86400000 + 2440587.5;
}

/** Interpolated ecliptic position (AU) at jd; clamps to the sampled span. */
export function positionAt(points: EphPoint[], jd: number): [number, number, number] {
  const n = points.length;
  if (jd <= points[0][0]) return [points[0][1], points[0][2], points[0][3]];
  if (jd >= points[n - 1][0]) return [points[n - 1][1], points[n - 1][2], points[n - 1][3]];
  // binary search
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= jd) lo = mid; else hi = mid;
  }
  const [t0, x0, y0, z0] = points[lo];
  const [t1, x1, y1, z1] = points[hi];
  const f = (jd - t0) / (t1 - t0);
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f];
}

/** Index of the sampled point nearest "now" — splits past vs future path. */
export function nowIndex(points: EphPoint[], jd: number): number {
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= jd) lo = mid; else hi = mid;
  }
  return lo;
}
