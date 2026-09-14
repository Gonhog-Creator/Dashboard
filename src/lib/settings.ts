import { prisma, ensureWal } from "./db";

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
}

export async function getAllSettings(): Promise<Record<string, string>> {
  await ensureWal();
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Observer location: Setting table wins, env vars are the fallback/default. */
export async function getObserver() {
  const [lat, lon, elev, name] = await Promise.all([
    getSettingOr(SETTING_KEYS.observerLat, process.env.OBSERVER_LAT ?? "33.87"),
    getSettingOr(SETTING_KEYS.observerLon, process.env.OBSERVER_LON ?? "-78.00"),
    getSettingOr(
      SETTING_KEYS.observerElevation,
      process.env.OBSERVER_ELEVATION_M ?? "3"
    ),
    getSettingOr(SETTING_KEYS.observerName, "Bald Head Island, NC"),
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
