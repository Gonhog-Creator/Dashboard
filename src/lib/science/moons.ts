/**
 * Major moons per planet, ordered by real semi-major axis. Rendered on
 * analytic circular orbits (period-accurate angular speed, deterministic
 * phase) — real ephemeris would need planet-centric Horizons vectors per
 * moon; at this scale circular orbits read identically.
 */
export interface MoonDef {
  name: string;
  /** sidereal orbital period in days */
  periodDays: number;
  /** orbit direction — Triton is retrograde */
  retrograde?: boolean;
}

export const MOONS: Record<string, MoonDef[]> = {
  earth: [{ name: "Moon", periodDays: 27.32 }],
  mars: [
    { name: "Phobos", periodDays: 0.319 },
    { name: "Deimos", periodDays: 1.263 },
  ],
  jupiter: [
    { name: "Io", periodDays: 1.769 },
    { name: "Europa", periodDays: 3.551 },
    { name: "Ganymede", periodDays: 7.155 },
    { name: "Callisto", periodDays: 16.69 },
  ],
  saturn: [
    { name: "Enceladus", periodDays: 1.37 },
    { name: "Rhea", periodDays: 4.518 },
    { name: "Titan", periodDays: 15.95 },
    { name: "Iapetus", periodDays: 79.33 },
  ],
  uranus: [
    { name: "Titania", periodDays: 8.706 },
    { name: "Oberon", periodDays: 13.46 },
  ],
  neptune: [{ name: "Triton", periodDays: 5.877, retrograde: true }],
};
