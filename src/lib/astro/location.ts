import { Observer } from "astronomy-engine";
import { getObserver } from "@/lib/settings";

export async function getAstroObserver(): Promise<{
  observer: Observer;
  name: string;
  lat: number;
  lon: number;
}> {
  const o = await getObserver();
  return {
    observer: new Observer(o.lat, o.lon, o.elevationM),
    name: o.name,
    lat: o.lat,
    lon: o.lon,
  };
}
