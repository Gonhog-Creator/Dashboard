/** Client-side shapes mirroring the API DTOs in src/lib/people.ts. */

export interface PersonListItem {
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
  linkCount?: number;
  taskCount?: number;
}

export interface RelationshipItem {
  id: string;
  personId: string;
  personName: string;
  type: string;
  direction: "out" | "in";
  label: string | null;
}

export interface PersonLinkItem {
  id: string;
  kind: string;
  title: string;
  url: string;
  fileId: string | null;
  mimeType: string | null;
}

export interface PersonTaskItem {
  linkId: string;
  taskId: string;
  title: string;
  done: boolean | null;
  dueDate: string | null;
  missing?: boolean;
}

export interface PersonDetailData extends PersonListItem {
  relationships: RelationshipItem[];
  links: PersonLinkItem[];
  tasks: { id: string; personId: string; taskId: string; title: string }[];
}

export const REL_TYPES = [
  "spouse",
  "parent",
  "child",
  "sibling",
  "family",
  "manager",
  "report",
  "colleague",
  "friend",
  "other",
] as const;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
