/**
 * ClashSpot stats scraper. Their stats pages embed every chart's full data in
 * `data-chart` JSON attributes on <canvas> elements — we parse those instead of
 * re-deriving distributions we can't get from the official API.
 *
 * They rate-limit aggressively (403 after a few rapid hits), so:
 *  - every page is cached 24h
 *  - outbound requests are throttled to one per ~5s
 *  - the UI fetches lazily per sub-tab
 */

import { cached } from "@/lib/cache";

const BASE = "https://clashspot.net/en/stats";
const TTL = 24 * 3600_000;
const MIN_INTERVAL = 5000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let lastFetch = 0;

async function throttledGet(url: string): Promise<string> {
  const wait = MIN_INTERVAL - (Date.now() - lastFetch);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`clashspot ${res.status}`);
  return res.text();
}

/** ClashSpot's exact palette, lifted from their CSS custom properties. */
const COLORS: Record<string, string> = {
  // Town Halls
  th1: "#e4913a", th2: "#e4913a", th3: "#e4913a", th4: "#e4913a",
  th5: "#e4913a", th6: "#e4913a", th7: "#e4913a", th8: "#9b683f",
  th9: "#484b57", th10: "#b92217", th11: "#e1dbe6", th12: "#1c62ac",
  th13: "#24b9cf", th14: "#26b483", th15: "#725e8e", th16: "#ffd241",
  th17: "#3c556e", th18: "#8cd2fa",
  // Named
  blue: "#2e86ab", green: "#49a078", red: "#f24236", orange: "#ff8700",
  purple: "#8a3a68", grey: "#646464", yellow: "#f4c200", pink: "#e6329b",
  gold: "#ffdc14", elixir: "#ff19ff", "dark-elixir": "#5a4664",
  stars: "#f4d94b", bh: "#ff8a4b",
  // Heroes
  "barbarian-king": "#ce4c42", "archer-queen": "#563491",
  "grand-warden": "#978fbe", "royal-champion": "#387dd0",
  "minion-prince": "#3cb9e6", "battle-machine": "#a8592e",
  "battle-copter": "#a8592e",
  // Pets
  "home-lassi": "#6884e0", "home-electro-owl": "#69c8c8",
  "home-mighty-yak": "#d07028", "home-unicorn": "#ffe458",
  "home-frosty": "#fcfeff", "home-diggy": "#ae82ff",
  "home-phoenix": "#ef3b88", "home-poison-lizard": "#c5c038",
  "home-spirit-fox": "#8cf0fa", "home-angry-jelly": "#db5ffc",
  "home-sneezy": "#9aa0c6",
};

const FALLBACK = ["#2e86ab", "#49a078", "#f24236", "#ff8700", "#8a3a68",
  "#f4c200", "#e6329b", "#646464", "#24b9cf", "#26b483"];

export function csColor(name: string, i = 0): string {
  return COLORS[name] ?? FALLBACK[i % FALLBACK.length];
}

export interface CsDataset {
  label?: string;
  color: string | string[];
  values: number[];
}

export interface CsChart {
  /** "bar" | "barPercent" | other → rendered as bar. */
  type: string;
  title: string;
  icon: string | null;
  labels: (string | number)[];
  datasets: CsDataset[];
  /** Per-label images (TH/league icons) for x-axis ticks. */
  images: string[];
  /** Display names for labels (tooltips). */
  tooltipValues: string[];
  yTitle: string | null;
  stacked: boolean;
}

const stripTags = (s: string) =>
  s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Fetch one ClashSpot stats page and extract its charts. Cached 24h. */
export function getClashSpotPage(path: string): Promise<{ charts: CsChart[] }> {
  const safe = path.replace(/[^a-z0-9/-]/gi, "");
  return cached(`clashspot:${safe}`, TTL, async () => {
    const html = await throttledGet(`${BASE}/${safe}`);
    const charts: CsChart[] = [];
    const re = /data-chart="([^"]+)"/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(html))) {
      n++;
      // Nearest preceding <h2>/<h3> = chart title (+ optional icon img).
      const before = html.slice(Math.max(0, m.index - 4000), m.index);
      const heads = [
        ...before.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g),
      ];
      const head = heads.pop()?.[1] ?? "";
      const title = stripTags(decodeEntities(head)) || `Chart ${n}`;
      const icon = head.match(/src="([^"]+)"/)?.[1] ?? null;

      let raw: {
        chart?: string;
        options?: { labels?: (string | number)[]; data?: CsDataset[] };
        chart_options?: {
          images?: string[];
          tooltip_values?: string[];
          scales?: {
            y?: { title?: { text?: string } };
            x?: { stacked?: boolean };
          };
        };
      };
      try {
        raw = JSON.parse(decodeEntities(m[1]));
      } catch {
        continue;
      }
      const opts = raw.options ?? {};
      const co = raw.chart_options ?? {};
      charts.push({
        type: raw.chart?.includes("Percent") ? "barPercent" : "bar",
        title,
        icon,
        labels: opts.labels ?? [],
        datasets: (opts.data ?? []).map((d, di) => ({
          label: d.label,
          color: Array.isArray(d.color)
            ? d.color.map((c, i) => csColor(c, i))
            : csColor(d.color, di),
          values: d.values,
        })),
        images: co.images ?? [],
        tooltipValues: co.tooltip_values ?? [],
        yTitle: co.scales?.y?.title?.text ?? null,
        stacked: co.scales?.x?.stacked === true || (opts.data?.length ?? 0) > 1,
      });
    }
    return { charts };
  });
}
