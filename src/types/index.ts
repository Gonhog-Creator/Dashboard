export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  source: "google" | "apple" | "local";
  calendar?: string;
  location?: string;
}

export interface TonightConditions {
  date: string;
  observer: { lat: number; lon: number; name: string };
  dusk: string | null; // astro dusk ISO
  dawn: string | null; // astro dawn ISO
  darkHours: number;
  moon: {
    phase: number; // 0-1 illumination fraction
    altitude: number; // deg at midnight
    name: string;
  };
  hourly: HourlyCondition[];
  verdict: Verdict;
  fetchedAt: string;
}

export interface HourlyCondition {
  time: string;
  cloudCover: number | null; // %
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  precipProb: number | null;
  visibility: number | null; // meters
  humidity: number | null;
}

export type VerdictLevel = "GO" | "MARGINAL" | "NO-GO" | "UNKNOWN";

export interface Verdict {
  level: VerdictLevel;
  score: number; // 0-100
  reasons: string[];
}

export interface VisibleTarget {
  name: string;
  type: string;
  magnitude: number | null;
  constellation?: string;
  ra: number; // hours
  dec: number; // deg
  maxAltitude: number; // deg
  transitTime: string | null; // ISO
  moonSeparation: number; // deg
  hoursAbove30: number; // hours above 30° during darkness
  score: number; // composite ranking
}

export interface FitsScanResult {
  scannedAt: string;
  root: string;
  fileCount: number;
  targets: FitsTargetSummary[];
  errors: string[];
}

export interface FitsTargetSummary {
  object: string;
  frames: number;
  totalSeconds: number;
  totalBytes: number;
  sessions: { date: string; frames: number; seconds: number; path: string }[];
  lastImagedAt: string | null;
}

export interface JobStatus {
  key: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
}
