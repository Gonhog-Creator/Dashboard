import { Body, Equator, Horizon, type Observer } from "astronomy-engine";
import { CATALOG } from "./catalog";
import { darknessWindow } from "./weather";
import { getAstroObserver } from "./location";
import type { VisibleTarget } from "@/types";

const STEP_MIN = 10;
const MIN_ALT = 30; // degrees — below this is murk

function angularSeparation(
  ra1: number, dec1: number,
  ra2: number, dec2: number
): number {
  const toRad = Math.PI / 180;
  const dRa = (ra1 - ra2) * 15 * toRad; // hours → deg → rad
  const d1 = dec1 * toRad;
  const d2 = dec2 * toRad;
  const cos =
    Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dRa);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / toRad;
}

export function visibleTonight(
  observer: Observer,
  from = new Date()
): VisibleTarget[] {
  const { dusk, dawn } = darknessWindow(observer, from);
  if (!dusk || !dawn) return [];

  const results: VisibleTarget[] = [];
  const stepMs = STEP_MIN * 60 * 1000;

  // Moon track for separation scoring
  const moonAt = (d: Date) => {
    const eq = Equator(Body.Moon, d, observer, true, true);
    const hor = Horizon(d, observer, eq.ra, eq.dec, "normal");
    return { ra: eq.ra, dec: eq.dec, alt: hor.altitude };
  };

  for (const t of CATALOG) {
    let maxAlt = -90;
    let transit: Date | null = null;
    let aboveMin = 0;
    let minMoonSep = 180;

    for (let ms = dusk.getTime(); ms <= dawn.getTime(); ms += stepMs) {
      const d = new Date(ms);
      const hor = Horizon(d, observer, t.ra, t.dec, "normal");
      if (hor.altitude > maxAlt) {
        maxAlt = hor.altitude;
        transit = d;
      }
      if (hor.altitude >= MIN_ALT) aboveMin += STEP_MIN / 60;

      const moon = moonAt(d);
      if (moon.alt > 0) {
        const sep = angularSeparation(t.ra, t.dec, moon.ra, moon.dec);
        if (sep < minMoonSep) minMoonSep = sep;
      }
    }

    if (maxAlt < 15) continue; // never rises usefully

    // Score: altitude (0-50) + time above 30° (0-30) + moon distance (0-20)
    const altScore = Math.min(50, (maxAlt / 90) * 50);
    const timeScore = Math.min(30, aboveMin * 6);
    const moonScore = Math.min(20, (minMoonSep / 180) * 20);
    const score = Math.round(altScore + timeScore + moonScore);

    results.push({
      name: t.name,
      type: t.type,
      magnitude: t.mag,
      ra: t.ra,
      dec: t.dec,
      maxAltitude: Math.round(maxAlt * 10) / 10,
      transitTime: transit?.toISOString() ?? null,
      moonSeparation: Math.round(minMoonSep),
      hoursAbove30: Math.round(aboveMin * 10) / 10,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function tonightTargets(limit = 25): Promise<VisibleTarget[]> {
  const { observer } = await getAstroObserver();
  return visibleTonight(observer).slice(0, limit);
}
