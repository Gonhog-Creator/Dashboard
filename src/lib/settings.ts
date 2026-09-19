import { prisma, ensureWal } from "./db";
import { bust, cached } from "./cache";

export const SETTING_KEYS = {
  fitsScanPath: "fits.scanPath",
  observerLat: "observer.lat",
  observerLon: "observer.lon",
  observerElevation: "observer.elevationM",
  observerName: "observer.name",
  weatherJobCron: "jobs.weather.cron",
  fitsJobCron: "jobs.fitsScan.cron",
  quickLinks: "ui.quickLinks",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  await ensureWal();
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getSettingOr(key: string, fallback: string): Promise<string> {
  return (await getSetting(key)) ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await ensureWal();
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  // Observer changes invalidate everything derived from location.
  if (key.startsWith("observer.")) {
    bust("observer");
    bust("astro:tonight");
    bust("astro:conditions");
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  await ensureWal();
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Observer location: Setting table wins, env vars are the fallback/default.
 *  Cached 60s — it's read on every weather/targets computation. */
export function getObserver() {
  return cached("observer", 60_000, getObserverUncached);
}

async function getObserverUncached() {
  const [lat, lon, elev, name] = await Promise.all([
    getSettingOr(SETTING_KEYS.observerLat, process.env.OBSERVER_LAT ?? "35.9132"),
    getSettingOr(SETTING_KEYS.observerLon, process.env.OBSERVER_LON ?? "-79.0558"),
    getSettingOr(
      SETTING_KEYS.observerElevation,
      process.env.OBSERVER_ELEVATION_M ?? "150"
    ),
    getSettingOr(SETTING_KEYS.observerName, "Chapel Hill, NC"),
  ]);
  return {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    elevationM: parseFloat(elev),
    name,
  };
}

export async function getFitsScanPath() {
  return getSettingOr(
    SETTING_KEYS.fitsScanPath,
    process.env.FITS_SCAN_PATH ?? ""
  );
}

const COVERS_KEY = "astro.covers";

/** User-chosen cover images: { [canonicalTargetName]: path relative to scan root }. */
export async function getAstroCovers(): Promise<Record<string, string>> {
  const raw = await getSetting(COVERS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function setAstroCover(targetName: string, relPath: string) {
  const covers = await getAstroCovers();
  covers[targetName] = relPath;
  await setSetting(COVERS_KEY, JSON.stringify(covers));
}
