import { findInCatalog } from "./catalog";

/**
 * Fetches PersonalWebsite's dsoData.ts and extracts published target names.
 * Uses GitHub raw content (read-only). Set GITHUB_TOKEN for private repos.
 */
export async function fetchPublishedTargets(): Promise<{
  names: string[];
  error?: string;
}> {
  const repo = process.env.PERSONAL_WEBSITE_REPO ?? "Gonhog-Creator/PersonalWebsite";
  const filePath =
    process.env.PERSONAL_WEBSITE_DSO_PATH ?? "src/data/dsoData.ts";
  const url = `https://raw.githubusercontent.com/${repo}/main/${filePath}`;

  const headers: Record<string, string> = {};
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(url, { headers, next: { revalidate: 3600 } });
    if (!res.ok) {
      return { names: [], error: `GitHub ${res.status} for ${url}` };
    }
    const text = await res.text();

    // Extract title fields: `title: "M31"` or `title: 'Andromeda'` etc.
    const names = new Set<string>();
    const re = /title:\s*["'`]([^"'`]+)["'`]/g;
    let m;
    while ((m = re.exec(text))) names.add(m[1].trim());

    return { names: [...names] };
  } catch (e) {
    return { names: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Normalize a published title to a catalog name when possible. */
export function normalizePublishedName(title: string): string {
  const direct = findInCatalog(title);
  if (direct) return direct.name;
  // Try extracting an M/NGC/IC designator from the title, e.g. "Andromeda (M31)"
  const m = title.match(/\b(M\d{1,3}|NGC\s?\d{1,4}|IC\s?\d{1,4})\b/i);
  if (m) {
    const hit = findInCatalog(m[1].replace(/\s+/, " "));
    if (hit) return hit.name;
  }
  return title;
}
