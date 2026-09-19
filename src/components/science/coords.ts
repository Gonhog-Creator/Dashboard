import * as THREE from "three";
import { EPHEMERIS, positionAt, toJD } from "@/lib/science/ephemeris";
import type { EphPoint } from "@/lib/science/ephemeris";
import { MOONS } from "@/lib/science/moons";
import type { PathFrame } from "./types";

/** Scene units per AU in the solar-system view. */
export const AU = 50;

let earthPos: THREE.Vector3 | null = null;

/** Earth's current heliocentric position in scene units (cached). */
export function getEarthPos(): THREE.Vector3 {
  if (!earthPos) {
    const [x, y, z] = positionAt(EPHEMERIS.planets.earth.points, toJD(new Date()));
    earthPos = eclToThree(x, y, z);
  }
  return earthPos.clone();
}

let bubbles: { pos: THREE.Vector3; clearance: number }[] | null = null;

/**
 * Keep-out sphere per planet — planet meshes are exaggerated, so a craft
 * orbiting one (Juno/Jupiter, BepiColombo/Mercury) would render inside it.
 * Earth gets extra room so near-earth craft stay clear of the globe;
 * Saturn's clearance covers its rings (~6.2 units).
 */
function getPlanetBubbles() {
  if (!bubbles) {
    const jd = toJD(new Date());
    bubbles = Object.entries(EPHEMERIS.planets).map(([id, p]) => {
      const [x, y, z] = positionAt(p.points, jd);
      const clearance =
        id === "earth" ? 2.6 : id === "saturn" ? 6.7 : p.radius + 0.5;
      return { pos: eclToThree(x, y, z), clearance };
    });
  }
  return bubbles;
}

/** Push a scene point out of any planet keep-out sphere it falls inside. */
export function pushOutOfPlanets(p: THREE.Vector3): THREE.Vector3 {
  for (const { pos, clearance } of getPlanetBubbles()) {
    const d = p.distanceTo(pos);
    if (d < clearance) {
      const dir =
        d > 0.01 ? p.clone().sub(pos).normalize() : new THREE.Vector3(0, 1, 0);
      return pos.clone().add(dir.multiplyScalar(clearance));
    }
  }
  return p;
}

/**
 * World-space trajectory points for a craft.
 * "helio": raw heliocentric path, pushed out of planet meshes.
 * "earth": geocentric path (craft - earth per epoch) anchored at earth's
 * current position, scaled so the path's now-point lands on the rendered
 * node — near-earth halos stretch out of the keep-out bubble while distant
 * craft keep scale ~1 (honest geocentric shape). Reveals the orbital
 * mechanics: L1/L2 halos, flyby loops, etc.
 */
export function trajectoryScenePoints(
  points: EphPoint[],
  frame: PathFrame
): THREE.Vector3[] {
  if (frame === "helio") {
    return points.map(([, x, y, z]) => pushOutOfPlanets(eclToThree(x, y, z)));
  }
  const earthNow = getEarthPos();
  const epts = EPHEMERIS.planets.earth.points;
  // earth's ephemeris covers ~1 orbit but craft spans years — wrap the
  // lookup into that span or positionAt clamps, earth freezes, and the
  // relative vector drifts ~1 AU/yr (JWST's halo ended up past saturn)
  const e0 = epts[0][0];
  const ePeriod = epts[epts.length - 1][0] - e0;
  const wrapEarth = (jd: number) =>
    e0 + ((((jd - e0) % ePeriod) + ePeriod) % ePeriod);
  const jdNow = toJD(new Date());
  const [cx, cy, cz] = positionAt(points, jdNow);
  const [ex, ey, ez] = positionAt(epts, wrapEarth(jdNow));
  const relNow = eclToThree(cx - ex, cy - ey, cz - ez);
  const nodePos = pushOutOfPlanets(eclToThree(cx, cy, cz));
  const scale =
    relNow.length() > 1e-6 ? nodePos.distanceTo(earthNow) / relNow.length() : 1;
  return points.map(([jd, x, y, z]) => {
    const [ex2, ey2, ez2] = positionAt(epts, wrapEarth(jd));
    const rel = eclToThree(x - ex2, y - ey2, z - ez2).multiplyScalar(scale);
    return earthNow.clone().add(rel);
  });
}

/**
 * Moon orbit radius in scene units — evenly spaced just outside the planet
 * mesh (or saturn's rings); real distances would sit inside the exaggerated
 * planets. Ordering by index preserves real distance ordering.
 */
export function moonOrbitRadius(planetId: string, index: number): number {
  const p = EPHEMERIS.planets[planetId];
  const base = planetId === "saturn" ? 7.0 : p.radius + 0.45;
  return base + index * 0.55;
}

/** World position of a planet's moon (index into MOONS[planetId]). */
export function moonWorldPos(planetId: string, index: number): THREE.Vector3 {
  const m = MOONS[planetId][index];
  const p = EPHEMERIS.planets[planetId];
  const [x, y, z] = positionAt(p.points, toJD(new Date()));
  const center = eclToThree(x, y, z);
  const r = moonOrbitRadius(planetId, index);
  const dir = m.retrograde ? -1 : 1;
  const jd = toJD(new Date());
  const ang = dir * ((jd / m.periodDays) * Math.PI * 2) + index * 2.1;
  return center.add(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
}

/** Standard equirect-texture mapping for three.js SphereGeometry. */
export function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Heliocentric ecliptic J2000 (AU) -> three.js scene units.
 * Ecliptic plane lies on XZ, north ecliptic pole is +Y (right-handed).
 */
export function eclToThree(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x * AU, z * AU, -y * AU);
}
