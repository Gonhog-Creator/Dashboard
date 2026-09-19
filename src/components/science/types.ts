import type { Facility } from "@/lib/science/facilities";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  seen: boolean;
}

export interface FacilityState extends Facility {
  status: "online" | "offline" | "unknown";
  unseen: number;
  news: NewsItem[];
}

export interface ScienceData {
  facilities: FacilityState[];
  totalUnseen: number;
  fetchedAt: string;
}

export type Selection =
  | { type: "facility"; id: string }
  | { type: "spacecraft"; id: string }
  | { type: "planet"; id: string }
  | { type: "moon"; planet: string; index: number }
  | { type: "earth" }
  | null;

export type ViewMode = "earth" | "system";

/** trajectory reference frame: heliocentric or earth-relative (geocentric) */
export type PathFrame = "helio" | "earth";
