import { prisma } from "@/lib/db";
import type { Person, PersonRelationship } from "@prisma/client";

/**
 * People CRM — shared types and helpers.
 *
 * Relationship types are a fixed set so the graph view and detail panels can
 * color/label them consistently. Directed types carry meaning from→to;
 * symmetric types are stored once and displayed on both ends.
 */

export const RELATIONSHIP_TYPES = [
  // family
  "spouse",
  "parent",
  "child",
  "sibling",
  "family", // generic kinship — used by last-name auto-linking
  // work
  "manager",
  "report",
  "colleague",
  // social
  "friend",
  "other",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Directed types get a different label when viewed from the `to` side. */
export const INVERSE_LABEL: Record<RelationshipType, string> = {
  spouse: "spouse",
  sibling: "sibling",
  friend: "friend",
  colleague: "colleague",
  other: "other",
  parent: "child",
  child: "parent",
  manager: "report",
  report: "manager",
  family: "family",
};

export const SYMMETRIC_TYPES: ReadonlySet<string> = new Set([
  "spouse",
  "sibling",
  "family",
  "friend",
  "colleague",
  "other",
]);

export interface PersonDTO {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  birthday: string | null;
  meetUrl: string | null;
  avatarUrl: string | null;
  notes: string | null;
  tags: string[];
  customFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipDTO {
  id: string;
  /** The other person in the relationship. */
  personId: string;
  personName: string;
  /** Label as seen from the perspective of the person being viewed. */
  type: string;
  /** Raw stored direction: "out" = viewer is `from`, "in" = viewer is `to`. */
  direction: "out" | "in";
  label: string | null;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toDTO(p: Person): PersonDTO {
  return {
    id: p.id,
    name: p.name,
    company: p.company,
    role: p.role,
    email: p.email,
    phone: p.phone,
    location: p.location,
    birthday: p.birthday,
    meetUrl: p.meetUrl,
    avatarUrl: p.avatarUrl,
    notes: p.notes,
    tags: parseJson<string[]>(p.tags, []),
    customFields: parseJson<Record<string, string>>(p.customFields, {}),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export interface PersonInput {
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  birthday?: string | null;
  meetUrl?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  tags?: string[];
  customFields?: Record<string, string>;
}

export function personData(input: PersonInput) {
  return {
    name: input.name,
    company: input.company ?? null,
    role: input.role ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    location: input.location ?? null,
    birthday: input.birthday ?? null,
    meetUrl: input.meetUrl ?? null,
    avatarUrl: input.avatarUrl ?? null,
    notes: input.notes ?? null,
    tags: JSON.stringify(input.tags ?? []),
    customFields: JSON.stringify(input.customFields ?? {}),
  };
}

/**
 * All relationships for a person, normalized so each entry names the *other*
 * person and the label from the viewer's perspective.
 */
export async function relationshipsFor(
  personId: string
): Promise<RelationshipDTO[]> {
  const rels = await prisma.personRelationship.findMany({
    where: { OR: [{ fromId: personId }, { toId: personId }] },
    include: { from: true, to: true },
    orderBy: { type: "asc" },
  });
  return rels.map((r) => {
    const out = r.fromId === personId;
    const other = out ? r.to : r.from;
    return {
      id: r.id,
      personId: other.id,
      personName: other.name,
      type: out ? r.type : INVERSE_LABEL[r.type as RelationshipType] ?? r.type,
      direction: out ? ("out" as const) : ("in" as const),
      label: r.label,
    };
  });
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Last token of a name, skipping generational suffixes (Jr, III…). */
function lastName(name: string): string | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  let last = parts[parts.length - 1].toLowerCase().replace(/[.,]/g, "");
  if (NAME_SUFFIXES.has(last) && parts.length > 2)
    last = parts[parts.length - 2].toLowerCase().replace(/[.,]/g, "");
  return last.length >= 2 ? last : null;
}

/**
 * Group people by last name and create symmetric "family" relationships
 * between every pair sharing one. Existing relationships (any type, either
 * direction) are left untouched — only missing links are created.
 */
export async function linkFamiliesByLastName(): Promise<{
  families: number;
  created: number;
}> {
  const [people, existing] = await Promise.all([
    prisma.person.findMany({ select: { id: true, name: true } }),
    prisma.personRelationship.findMany({
      select: { fromId: true, toId: true },
    }),
  ]);

  const linked = new Set(
    existing.map((r) => [r.fromId, r.toId].sort().join("|"))
  );

  const groups = new Map<string, string[]>();
  for (const p of people) {
    const ln = lastName(p.name);
    if (!ln) continue;
    const arr = groups.get(ln) ?? [];
    arr.push(p.id);
    groups.set(ln, arr);
  }

  let families = 0;
  const creates: { fromId: string; toId: string; type: string }[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    families++;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|");
        if (linked.has(key)) continue;
        linked.add(key);
        creates.push({ fromId: ids[i], toId: ids[j], type: "family" });
      }
    }
  }

  if (creates.length)
    await prisma.personRelationship.createMany({ data: creates });

  return { families, created: creates.length };
}

export interface GraphData {
  nodes: { id: string; name: string; company: string | null; avatarUrl: string | null }[];
  edges: { source: string; target: string; type: string }[];
}

/** Nodes + edges for the force graph. Includes implicit company edges. */
export async function graphData(includeCompanyEdges: boolean): Promise<GraphData> {
  const [people, rels] = await Promise.all([
    prisma.person.findMany({
      select: { id: true, name: true, company: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.personRelationship.findMany({
      select: { fromId: true, toId: true, type: true },
    }),
  ]);

  const edges = rels.map((r) => ({
    source: r.fromId,
    target: r.toId,
    type: r.type,
  }));

  if (includeCompanyEdges) {
    const byCompany = new Map<string, string[]>();
    for (const p of people) {
      const c = p.company?.trim().toLowerCase();
      if (!c) continue;
      const arr = byCompany.get(c) ?? [];
      arr.push(p.id);
      byCompany.set(c, arr);
    }
    const seen = new Set(edges.map((e) => `${e.source}|${e.target}`));
    for (const ids of byCompany.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = `${ids[i]}|${ids[j]}`;
          const keyRev = `${ids[j]}|${ids[i]}`;
          if (seen.has(key) || seen.has(keyRev)) continue;
          edges.push({ source: ids[i], target: ids[j], type: "company" });
          seen.add(key);
        }
      }
    }
  }

  return { nodes: people, edges };
}
