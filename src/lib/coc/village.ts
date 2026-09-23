/**
 * Parser for the in-game "Data Export" village JSON (Settings → More Settings
 * → Data Export → Copy). Same format Clash Ninja's one-tap import consumes.
 *
 * Entries use internal `data` ids — resolved via gamedata.json, a compact
 * extract of ClashKing's static_data (https://assets.clashk.ing/static_data).
 * Per-level required_townhall gives true max levels at the player's TH.
 * Icons come from the ClashKing CDN (assets.clashk.ing).
 */

import gamedata from "./gamedata.json";

const CDN = "https://assets.clashk.ing";

/** id → [name, type, village, reqTH[]] (reqTH[i] = TH required for level i+1) */
const DATA = gamedata as unknown as Record<
  string,
  [string, string, string, number[]]
>;

interface GameItem {
  name: string;
  type: string;
  village: string;
  reqTH: number[];
}

/** gamedata stores literal \q for quotes — restore them for display. */
function cleanName(n: string): string {
  return n.replace(/\\q/g, '"');
}

function info(id: number): GameItem | null {
  const e = DATA[id];
  if (!e) return null;
  return { name: cleanName(e[0]), type: e[1], village: e[2], reqTH: e[3] };
}

function nameOf(id: number): string {
  return DATA[id] ? cleanName(DATA[id][0]) : `Unknown ${id}`;
}

/** Raw gamedata lookup by internal id (army-link decoding, etc.). */
export function gameItem(id: number): GameItem | null {
  return info(id);
}

/** Highest level available at the given town hall (absolute max if ungated). */
function maxLevelAt(id: number, th: number): number | null {
  const e = DATA[id];
  if (!e) return null;
  const req = e[3];
  if (req.length === 0) return null;
  let max = 0;
  for (let i = 0; i < req.length; i++) {
    if (req[i] === 0 || req[i] <= th) max = i + 1;
  }
  return max || req.length;
}

export type IconKind =
  | "building"
  | "trap"
  | "troop"
  | "hero"
  | "pet"
  | "spell"
  | "equipment"
  | "siege"
  | "obstacle"
  | "decoration"
  | "helper"
  | "guardian";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/ /g, "_")
    .replace(/["?!\\]/g, ""); // CDN filenames drop quotes/punctuation (apostrophes stay)
}

export function iconUrl(kind: IconKind, name: string, lvl?: number): string {
  const slug = slugify(name);
  switch (kind) {
    case "building":
      return `${CDN}/buildings/home-village/${slug}/level_${lvl ?? 1}.webp`;
    case "trap":
      return `${CDN}/traps/home-village/${slug}/level_${lvl ?? 1}.webp`;
    case "spell":
      return `${CDN}/spells/${slug}.webp`;
    case "equipment":
      return `${CDN}/equipment/${slug}.webp`;
    case "obstacle":
      return `${CDN}/obstacles/home-village/${slug}.webp`;
    case "decoration":
      return `${CDN}/decorations/home-village/${slug}.webp`;
    case "helper":
      return `${CDN}/helpers/${slug}.webp`;
    case "guardian":
      return `${CDN}/guardians/${slug}/icon.webp`;
    case "siege":
      return `${CDN}/troops/${slug}/icon.webp`; // sieges live under troops
    default: {
      const dir = { troop: "troops", hero: "heroes", pet: "pets" }[kind] ?? `${kind}s`;
      return `${CDN}/${dir}/${slug}/icon.webp`;
    }
  }
}

// ---------- raw export types ----------

interface RawEntry {
  data: number;
  lvl?: number;
  cnt?: number;
  timer?: number; // seconds remaining on active upgrade
  supercharge?: number;
  gear_up?: number;
  helper_cooldown?: number;
  types?: { data: number; modules?: RawEntry[] }[];
}

interface RawVillage {
  tag?: string;
  timestamp?: number;
  [key: string]: unknown;
}

// ---------- parsed output ----------

export interface VillageItem {
  dataId: number;
  name: string;
  count: number;
  levels: number[]; // per-instance
  maxLevel: number | null;
  icon: string | null;
  supercharged: number;
  gearedUp: number;
  upgrading: { toLevel: number; finishAt: string }[];
}

export interface VillageCategory {
  key: string;
  label: string;
  current: number;
  max: number;
  pct: number | null;
  items: VillageItem[];
}

export interface ParsedVillage {
  tag: string | null;
  exportedAt: string | null;
  townHall: number;
  categories: VillageCategory[];
  upgrades: {
    name: string;
    icon: string | null;
    toLevel: number;
    finishAt: string;
  }[];
  obstacles: VillageItem[];
  decos: VillageItem[];
  helpers: { name: string; lvl: number; cooldownSec: number | null; icon: string | null }[];
  guardians: { name: string; lvl: number; icon: string | null }[];
  unmapped: number[];
}

/** Export keys we parse, mapped to icon kind. `*2` = builder base (skipped). */
const KEY_KIND: Record<string, IconKind> = {
  buildings: "building",
  traps: "trap",
  heroes: "hero",
  units: "troop",
  troops: "troop",
  siege_machines: "siege",
  sieges: "siege",
  spells: "spell",
  pets: "pet",
  equipment: "equipment",
  obstacles: "obstacle",
  decos: "decoration",
};

/** gamedata `type` → display category (buildings only). */
const BUILDING_CATEGORY: Record<string, string> = {
  Defense: "defenses",
  Resource: "resources",
  Army: "army",
  Wall: "walls",
  "Town Hall": "townhall",
};

const CATEGORY_LABEL: Record<string, string> = {
  townhall: "Town Hall",
  defenses: "Defenses",
  resources: "Resources",
  army: "Army",
  walls: "Walls",
  traps: "Traps",
  heroes: "Heroes",
  troops: "Troops",
  spells: "Spells",
  sieges: "Siege Machines",
  pets: "Pets",
  equipment: "Hero Equipment",
  other: "Other",
};

const CATEGORY_ORDER = [
  "townhall", "walls", "heroes", "defenses", "resources", "army",
  "traps", "equipment", "troops", "spells", "sieges", "pets", "other",
];

/** dataIds with no ClashKing CDN art — bundled locally instead. */
const ICON_OVERRIDE: Record<number, string> = {
  1000064: "/coc/bobs_hut.png", // B.O.B's Hut
  1000093: "/coc/helper_hut.png", // Helper Hut
  1000097: "/coc/crafting_station.png", // Crafting Station
};

/** "dataId:lvl" → icon URL, for levels newer than the CDN's art. */
const LEVEL_ICON_OVERRIDE: Record<string, string> = {
  "1000070:10": `${CDN}/buildings/home-village/blacksmith/level_9.webp`,
};

/** IconKind → category key (explicit — pluralization isn't uniform). */
const KIND_CATEGORY: Record<IconKind, string> = {
  building: "other", // buildings use BUILDING_CATEGORY instead
  trap: "traps",
  troop: "troops",
  hero: "heroes",
  pet: "pets",
  spell: "spells",
  equipment: "equipment",
  siege: "sieges",
  obstacle: "obstacles",
  decoration: "decos",
  helper: "other", // helpers/guardians are parsed separately, not via KEY_KIND
  guardian: "other",
};

function aggregate(
  entries: RawEntry[] | undefined,
  kind: IconKind,
  th: number,
  upgrades: ParsedVillage["upgrades"],
  now: number,
  unmapped: Set<number>
): VillageItem[] {
  const byId = new Map<number, VillageItem>();
  for (const e of entries ?? []) {
    if (typeof e?.data !== "number") continue;
    const meta = info(e.data);
    if (!meta) unmapped.add(e.data);
    // Skip builder-base entries that leak into home arrays.
    if (meta && meta.village === "builderBase") continue;
    const name = meta?.name ?? `Unknown ${e.data}`;
    let item = byId.get(e.data);
    if (!item) {
      item = {
        dataId: e.data,
        name,
        count: 0,
        levels: [],
        maxLevel: maxLevelAt(e.data, th),
        icon:
          ICON_OVERRIDE[e.data] ??
          LEVEL_ICON_OVERRIDE[`${e.data}:${e.lvl}`] ??
          (meta ? iconUrl(kind, name, e.lvl) : null),
        supercharged: 0,
        gearedUp: 0,
        upgrading: [],
      };
      byId.set(e.data, item);
    }
    const cnt = e.cnt ?? 1;
    item.count += cnt;
    for (let i = 0; i < cnt; i++) item.levels.push(e.lvl ?? 0);
    if (e.supercharge) item.supercharged += cnt;
    if (e.gear_up) item.gearedUp += cnt;
    if (e.timer) {
      const up = {
        toLevel: (e.lvl ?? 0) + 1,
        finishAt: new Date(now + e.timer * 1000).toISOString(),
      };
      item.upgrading.push(up);
      upgrades.push({ name, icon: item.icon, ...up });
    }
    // Crafted Defense: modules carry their own levels/timers.
    for (const t of e.types ?? []) {
      for (const m of t.modules ?? []) {
        if (m.timer) {
          upgrades.push({
            name: `${name} module`,
            icon: item.icon,
            toLevel: (m.lvl ?? 0) + 1,
            finishAt: new Date(now + m.timer * 1000).toISOString(),
          });
        }
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function category(key: string, items: VillageItem[]): VillageCategory {
  let current = 0;
  let max = 0;
  let known = false;
  for (const it of items) {
    const sum = it.levels.reduce((s, l) => s + l, 0);
    current += sum;
    // Items with no known max (brand-new content) count as maxed so they
    // can't push the category over 100%.
    const effMax =
      it.maxLevel != null ? Math.max(it.maxLevel, ...it.levels) : Math.max(...it.levels, 1);
    max += effMax * it.count;
    if (it.maxLevel != null) known = true;
  }
  return {
    key,
    label: CATEGORY_LABEL[key] ?? key,
    current,
    max,
    pct: known && max > 0 ? Math.min(100, Math.round((current / max) * 100)) : null,
    items,
  };
}

export function parseVillage(json: string): ParsedVillage {
  const raw = JSON.parse(json) as RawVillage;
  const now = Date.now();
  const upgrades: ParsedVillage["upgrades"] = [];
  const unmapped = new Set<number>();

  const buildings = (raw.buildings as RawEntry[] | undefined) ?? [];
  const thEntry = buildings.find((b) => b.data === 1000001);
  const townHall = thEntry?.lvl ?? 0;

  // Aggregate every known export key.
  const parsed = new Map<string, VillageItem[]>();
  for (const [key, kind] of Object.entries(KEY_KIND)) {
    const items = aggregate(
      raw[key] as RawEntry[] | undefined,
      kind,
      townHall,
      upgrades,
      now,
      unmapped
    );
    for (const it of items) {
      // Merge same ids across alias keys (units/troops, sieges/siege_machines).
      const catKey =
        kind === "building"
          ? (BUILDING_CATEGORY[info(it.dataId)?.type ?? ""] ?? "other")
          : KIND_CATEGORY[kind];
      const list = parsed.get(catKey) ?? [];
      const existing = list.find((x) => x.dataId === it.dataId);
      if (existing) {
        existing.count += it.count;
        existing.levels.push(...it.levels);
        existing.supercharged += it.supercharged;
        existing.gearedUp += it.gearedUp;
        existing.upgrading.push(...it.upgrading);
      } else {
        list.push(it);
      }
      parsed.set(catKey, list);
    }
  }

  const obstacles = parsed.get("obstacles") ?? [];
  parsed.delete("obstacles");
  const decos = parsed.get("decos") ?? [];
  parsed.delete("decos");

  // Fold uncategorized buildings (huts, etc.) into the traps tile.
  const otherItems = parsed.get("other") ?? [];
  const hadTraps = parsed.has("traps");
  if (otherItems.length) {
    parsed.set("traps", [...(parsed.get("traps") ?? []), ...otherItems]);
    parsed.delete("other");
  }

  const categories = CATEGORY_ORDER.filter((k) => parsed.has(k)).map((k) => {
    const c = category(k, parsed.get(k)!);
    if (k === "traps" && otherItems.length)
      c.label = hadTraps ? "Traps & Other" : "Other";
    return c;
  });

  const helpers = ((raw.helpers as RawEntry[] | undefined) ?? []).map((h) => ({
    name: nameOf(h.data),
    lvl: h.lvl ?? 0,
    cooldownSec: h.helper_cooldown ?? null,
    icon: DATA[h.data] ? iconUrl("helper", nameOf(h.data)) : null,
  }));
  const guardians = ((raw.guardians as RawEntry[] | undefined) ?? []).map(
    (g) => ({
      name: nameOf(g.data),
      lvl: g.lvl ?? 0,
      icon: DATA[g.data] ? iconUrl("guardian", nameOf(g.data)) : null,
    })
  );

  return {
    tag: raw.tag ?? null,
    exportedAt: raw.timestamp
      ? new Date(raw.timestamp * 1000).toISOString()
      : null,
    townHall,
    categories,
    upgrades: upgrades.sort(
      (a, b) => Date.parse(a.finishAt) - Date.parse(b.finishAt)
    ),
    obstacles,
    decos,
    helpers,
    guardians,
    unmapped: [...unmapped],
  };
}
