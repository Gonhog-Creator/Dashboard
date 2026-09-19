import { FACILITIES } from "./facilities";
import { cached } from "@/lib/cache";

export type FacilityStatus = "online" | "offline" | "unknown";

/** HEAD (then GET fallback) each facility site; cached 10 min. */
async function checkAll(): Promise<Record<string, FacilityStatus>> {
  const entries = await Promise.all(
    FACILITIES.map(async (f) => {
      const status = await probe(f.url);
      return [f.id, status] as const;
    })
  );
  return Object.fromEntries(entries);
}

async function probe(url: string): Promise<FacilityStatus> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(6_000),
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (status probe)" },
      });
      // Any HTTP response means the site is reachable.
      if (res.status < 500) return "online";
    } catch {
      // try next method
    }
  }
  return "offline";
}

export function getFacilityStatuses(): Promise<Record<string, FacilityStatus>> {
  return cached("science:status", 10 * 60_000, checkAll);
}
