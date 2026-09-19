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
    angle: number; // 0-360 phase angle (<180 waxing, >180 waning)
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
  commonName: string | null; // e.g. "Andromeda Galaxy" for M31
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
  imageUrl: string | null; // local final/cover or DSS2 survey cutout
  track: { t: string; alt: number }[]; // altitude samples dusk→dawn
}

export interface FitsScanResult {
  scannedAt: string;
  root: string;
  fileCount: number;
  targets: FitsTargetSummary[];
  errors: string[];
}

export interface FilterDateBreakdown {
  date: string; // YYYY-MM-DD
  frames: number;
  seconds: number;
}

export interface FilterBreakdown {
  filter: string; // FILTER header value, or "OSC" when none recorded
  frames: number;
  seconds: number;
  subSeconds: number | null; // modal sub-exposure for this filter
  dates?: FilterDateBreakdown[]; // per-date subs; absent on pre-change scans
}

export interface FitsTargetSummary {
  object: string; // canonical name (catalog name when resolvable)
  aliases: string[]; // distinct raw OBJECT names merged into this target
  frames: number;
  totalSeconds: number;
  totalBytes: number;
  sessions: { date: string; frames: number; seconds: number; bytes: number; path: string }[];
  filters: FilterBreakdown[];
  finals: string[]; // image paths relative to scan root
  lastImagedAt: string | null;
}

/** Shape returned by GET /api/astro/scan for the Raw FITS library UI. */
export interface LibraryTarget {
  id: string;
  name: string;
  commonName: string | null;
  aliases: string[];
  scopes: string[]; // derived from session paths, e.g. ["SeeStar", "Askar 80PHQ"]
  totalFrames: number;
  totalSeconds: number;
  totalBytes: number;
  lastImagedAt: string | null;
  published: boolean;
  filters: FilterBreakdown[];
  finals: string[];
  cover: string | null; // user-chosen cover image (rel path), else null
  /** Integration per scope, derived from session paths (e.g. "SeeStar"). */
  scopeBreakdown: { scope: string; frames: number; seconds: number }[];
  sessions: { id: string; date: string; frames: number; seconds: number }[];
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

export interface GithubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
}

export interface ContributionDay {
  date: string; // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ContributionWeek {
  days: ContributionDay[];
}

export interface GithubPullRequest {
  id: number;
  title: string;
  repo: string; // owner/name
  number: number;
  url: string;
  createdAt: string;
  isDraft: boolean;
}

export interface GithubIssue {
  id: number;
  title: string;
  repo: string;
  number: number;
  url: string;
  createdAt: string;
}

export interface GithubActivityItem {
  id: string;
  text: string;
  repo: string | null;
  url: string;
  createdAt: string;
}

export interface GithubNotification {
  id: string;
  title: string;
  repo: string;
  type: string; // PullRequest | Issue | ...
  url: string;
  updatedAt: string;
  unread: boolean;
}

export interface GithubRepo {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  isPrivate: boolean;
  pushedAt: string;
}

export interface GithubDashboardData {
  configured: boolean;
  user: GithubUser | null;
  totalContributions: number;
  currentStreak: number;
  weeks: ContributionWeek[];
  myPRs: GithubPullRequest[];
  reviewRequests: GithubPullRequest[];
  assignedIssues: GithubIssue[];
  activity: GithubActivityItem[];
  notifications: GithubNotification[];
  notificationsUnsupported?: boolean;
  recentRepos: GithubRepo[];
  fetchedAt: string;
  errors: string[];
}
