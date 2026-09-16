import {
  Body,
  Equator,
  Horizon,
  MoonPhase,
  type Observer,
} from "astronomy-engine";
import type {
  HourlyCondition,
  TonightConditions,
  Verdict,
} from "@/types";
import { getAstroObserver } from "./location";

const OPEN_METEO =
  "https://api.open-meteo.com/v1/forecast" +
  "?hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high," +
  "precipitation_probability,visibility,relative_humidity_2m" +
  "&forecast_days=2&timezone=auto";

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    cloud_cover: (number | null)[];
    cloud_cover_low: (number | null)[];
    cloud_cover_mid: (number | null)[];
    cloud_cover_high: (number | null)[];
    precipitation_probability: (number | null)[];
    visibility: (number | null)[];
    relative_humidity_2m: (number | null)[];
  };
}

function sunAltitude(observer: Observer, date: Date): number {
  const eq = Equator(Body.Sun, date, observer, true, true);
  return Horizon(date, observer, eq.ra, eq.dec, "normal").altitude;
}

/** Find astronomical darkness window (sun below -18°) for tonight. */
export function darknessWindow(observer: Observer, from = new Date()) {
  // Sample sun altitude every 10 min over the next 20h
  const stepMs = 10 * 60 * 1000;
  let dusk: Date | null = null;
  let dawn: Date | null = null;
  let prevAlt = sunAltitude(observer, from);
  for (let t = from.getTime(); t < from.getTime() + 20 * 3600 * 1000; t += stepMs) {
    const d = new Date(t);
    const alt = sunAltitude(observer, d);
    if (prevAlt > -18 && alt <= -18 && !dusk) dusk = d;
    if (prevAlt < -18 && alt >= -18 && dusk && !dawn) dawn = d;
    prevAlt = alt;
  }
  const darkHours =
    dusk && dawn ? (dawn.getTime() - dusk.getTime()) / 3600_000 : 0;
  return { dusk, dawn, darkHours };
}

function moonInfo(observer: Observer, at: Date) {
  const phaseAngle = MoonPhase(at); // 0-360
  const illum = (1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2;
  const eq = Equator(Body.Moon, at, observer, true, true);
  const hor = Horizon(at, observer, eq.ra, eq.dec, "normal");
  const names = [
    "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
    "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
  ];
  const idx = Math.floor(((phaseAngle + 22.5) % 360) / 45);
  return {
    phase: Math.round(illum * 100) / 100,
    angle: Math.round(phaseAngle),
    altitude: Math.round(hor.altitude * 10) / 10,
    name: names[idx],
    ra: eq.ra,
    dec: eq.dec,
  };
}

export function computeVerdict(
  hourly: HourlyCondition[],
  darkHours: number,
  moonPhase: number,
  moonAlt: number
): Verdict {
  const reasons: string[] = [];
  if (hourly.length === 0) {
    return { level: "UNKNOWN", score: 0, reasons: ["No forecast data"] };
  }

  // Cloud cover during dark hours (weight low cloud heaviest)
  const clouds = hourly.map((h) => h.cloudCover ?? 100);
  const avgCloud = clouds.reduce((a, b) => a + b, 0) / clouds.length;
  const lowClouds = hourly.map((h) => h.cloudLow ?? 0);
  const avgLow = lowClouds.reduce((a, b) => a + b, 0) / lowClouds.length;
  const precip = Math.max(...hourly.map((h) => h.precipProb ?? 0));

  let score = 100;

  // Clouds: dominant factor
  const cloudPenalty = avgCloud * 0.7 + avgLow * 0.3;
  score -= cloudPenalty;
  if (avgCloud < 15) reasons.push(`Clear skies (~${Math.round(avgCloud)}% cloud)`);
  else if (avgCloud < 40) reasons.push(`Partly cloudy (~${Math.round(avgCloud)}%)`);
  else reasons.push(`Heavy cloud cover (~${Math.round(avgCloud)}%)`);

  // Moon: illumination matters most when it's up
  const moonUp = moonAlt > 0;
  const moonPenalty = moonUp ? moonPhase * 25 : moonPhase * 8;
  score -= moonPenalty;
  if (moonPhase > 0.7 && moonUp) reasons.push("Bright moon up — narrowband only");
  else if (moonPhase < 0.25) reasons.push("Dark moon");

  // Darkness duration
  if (darkHours < 2) {
    score -= 25;
    reasons.push(`Only ${darkHours.toFixed(1)}h of darkness`);
  } else {
    reasons.push(`${darkHours.toFixed(1)}h of astronomical darkness`);
  }

  // Precipitation
  if (precip > 30) {
    score -= 30;
    reasons.push(`${Math.round(precip)}% precip risk`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score > 80 ? "GO" : score >= 40 ? "MARGINAL" : "NO-GO";
  return { level, score, reasons };
}

export async function fetchTonight(): Promise<TonightConditions> {
  const { observer, name, lat, lon } = await getAstroObserver();

  const res = await fetch(`${OPEN_METEO}&latitude=${lat}&longitude=${lon}`, {
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;

  const { dusk, dawn, darkHours } = darknessWindow(observer);
  const midnight = dusk
    ? new Date(dusk.getTime() + ((dawn?.getTime() ?? dusk.getTime()) - dusk.getTime()) / 2)
    : new Date();
  const moon = moonInfo(observer, midnight);

  // Keep only tonight's dark hours (dusk → dawn)
  const hourly: HourlyCondition[] = [];
  data.hourly.time.forEach((t, i) => {
    const d = new Date(t);
    if (dusk && dawn && d >= dusk && d <= dawn) {
      hourly.push({
        time: t,
        cloudCover: data.hourly.cloud_cover[i],
        cloudLow: data.hourly.cloud_cover_low[i],
        cloudMid: data.hourly.cloud_cover_mid[i],
        cloudHigh: data.hourly.cloud_cover_high[i],
        precipProb: data.hourly.precipitation_probability[i],
        visibility: data.hourly.visibility[i],
        humidity: data.hourly.relative_humidity_2m[i],
      });
    }
  });

  const verdict = computeVerdict(hourly, darkHours, moon.phase, moon.altitude);

  return {
    date: new Date().toISOString().slice(0, 10),
    observer: { lat, lon, name },
    dusk: dusk?.toISOString() ?? null,
    dawn: dawn?.toISOString() ?? null,
    darkHours: Math.round(darkHours * 10) / 10,
    moon: {
      phase: moon.phase,
      angle: moon.angle,
      altitude: moon.altitude,
      name: moon.name,
    },
    hourly,
    verdict,
    fetchedAt: new Date().toISOString(),
  };
}
