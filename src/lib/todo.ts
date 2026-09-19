import { graphFetch, graphJson, msftConfigured } from "@/lib/graph";

/**
 * Microsoft To Do is the task store — the local Prisma Task/Project tables
 * are bypassed. Task ids are composite "listId:taskId" so PATCH/DELETE can
 * locate the task without an extra lookup.
 *
 * Field mapping:
 *   title     -> title
 *   notes     -> body.content (text)
 *   done      -> status === "completed"
 *   priority  -> importance (low/normal/high — local 0-3 is lossy: 2 -> normal)
 *   dueDate   -> dueDateTime (UTC)
 *   isAstro   -> categories includes "astro" (local-only convention)
 *   project   -> containing To Do list
 */

export interface TodoTaskItem {
  id: string; // "listId:taskId"
  title: string;
  notes: string | null;
  done: boolean;
  priority: number;
  dueDate: string | null;
  isAstro: boolean;
  createdAt: string | null;
  completedAt: string | null;
  project: { id: string; name: string; color: string | null } | null;
}

export const ASTRO_CATEGORY = "astro";

interface GraphList {
  id: string;
  displayName: string;
  wellknownListName?: string;
}

interface GraphTask {
  id: string;
  title: string;
  status: string;
  importance: "low" | "normal" | "high";
  body?: { content: string; contentType: string };
  dueDateTime?: { dateTime: string; timeZone: string } | null;
  completedDateTime?: { dateTime: string; timeZone: string } | null;
  createdDateTime?: string;
  categories?: string[];
}

const IMPORTANCE_TO_PRIORITY: Record<string, number> = {
  low: 1,
  normal: 0,
  high: 3,
};

const PRIORITY_TO_IMPORTANCE: Record<number, string> = {
  0: "normal",
  1: "low",
  2: "normal",
  3: "high",
};

function toItem(t: GraphTask, list: GraphList): TodoTaskItem {
  return {
    id: `${list.id}:${t.id}`,
    title: t.title,
    notes: t.body?.content ?? null,
    done: t.status === "completed",
    priority: IMPORTANCE_TO_PRIORITY[t.importance] ?? 0,
    dueDate: t.dueDateTime?.dateTime ? new Date(t.dueDateTime.dateTime).toISOString() : null,
    isAstro:
      (t.categories ?? []).includes(ASTRO_CATEGORY) ||
      list.displayName.toLowerCase() === ASTRO_CATEGORY,
    createdAt: t.createdDateTime ?? null,
    completedAt: t.completedDateTime?.dateTime
      ? new Date(t.completedDateTime.dateTime).toISOString()
      : null,
    project: { id: list.id, name: list.displayName, color: null },
  };
}

export function splitId(id: string): { listId: string; taskId: string } {
  const i = id.indexOf(":");
  if (i < 0) throw new Error(`bad task id: ${id}`);
  return { listId: id.slice(0, i), taskId: id.slice(i + 1) };
}

async function paged<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graphJson<{
      value: T[];
      "@odata.nextLink"?: string;
    }>(next);
    out.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return out;
}

export async function listLists(): Promise<GraphList[]> {
  return paged<GraphList>("/me/todo/lists?$top=50");
}

async function defaultList(lists: GraphList[]): Promise<GraphList> {
  const def = lists.find((l) => l.wellknownListName === "defaultList");
  if (def) return def;
  if (lists.length) return lists[0];
  // No lists at all — create the default "Tasks" list.
  return graphJson<GraphList>("/me/todo/lists", {
    method: "POST",
    body: JSON.stringify({ displayName: "Tasks" }),
  });
}

export interface TaskFilter {
  done?: boolean;
  due?: "today" | "overdue" | "upcoming";
  astro?: boolean;
}

// Short-lived cache of the full task set — fetching every list sequentially
// takes seconds, and several TaskList tiles mount at once. Writes invalidate.
const TASKS_TTL_MS = 60_000;
let allTasksCache: { at: number; tasks: TodoTaskItem[] } | null = null;

export function invalidateTaskCache(): void {
  allTasksCache = null;
}

async function fetchAllTasks(): Promise<TodoTaskItem[]> {
  if (allTasksCache && Date.now() - allTasksCache.at < TASKS_TTL_MS)
    return allTasksCache.tasks;
  const lists = await listLists();
  // Sequential — Graph throttles parallel bursts across lists (429s).
  const tasks: TodoTaskItem[] = [];
  for (const list of lists) {
    const items = await paged<GraphTask>(
      `/me/todo/lists/${list.id}/tasks?$top=100`
    );
    tasks.push(...items.map((t) => toItem(t, list)));
  }
  allTasksCache = { at: Date.now(), tasks };
  return tasks;
}

export async function listTasks(filter: TaskFilter = {}): Promise<TodoTaskItem[]> {
  const tasks = await fetchAllTasks();

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const filtered = tasks.filter((t) => {
    if (filter.done !== undefined && t.done !== filter.done) return false;
    if (filter.astro && !t.isAstro) return false;
    if (filter.due) {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      if (filter.due === "today" && d > endOfToday) return false;
      if (filter.due === "overdue" && d >= now) return false;
      if (filter.due === "upcoming" && d <= endOfToday) return false;
    }
    return true;
  });

  // Match the old Prisma ordering: open first, earliest due first (nulls first),
  // then higher priority.
  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.dueDate ? +new Date(a.dueDate) : -Infinity;
    const bd = b.dueDate ? +new Date(b.dueDate) : -Infinity;
    if (ad !== bd) return ad - bd;
    return b.priority - a.priority;
  });
  return filtered;
}

export interface TaskInput {
  title?: string;
  notes?: string | null;
  done?: boolean;
  priority?: number;
  dueDate?: string | null;
  projectId?: string | null;
  isAstro?: boolean;
}

export async function createTask(input: TaskInput): Promise<TodoTaskItem> {
  const lists = await listLists();
  const list = input.projectId
    ? lists.find((l) => l.id === input.projectId) ?? (await defaultList(lists))
    : input.isAstro
      ? (lists.find((l) => l.displayName.toLowerCase() === ASTRO_CATEGORY) ??
        (await defaultList(lists)))
      : await defaultList(lists);

  const body: Record<string, unknown> = { title: input.title };
  if (input.notes) body.body = { content: input.notes, contentType: "text" };
  if (input.priority !== undefined)
    body.importance = PRIORITY_TO_IMPORTANCE[input.priority] ?? "normal";
  if (input.dueDate)
    body.dueDateTime = {
      dateTime: new Date(input.dueDate).toISOString().slice(0, 19),
      timeZone: "UTC",
    };
  if (input.isAstro) body.categories = [ASTRO_CATEGORY];

  const created = await graphJson<GraphTask>(
    `/me/todo/lists/${list.id}/tasks`,
    { method: "POST", body: JSON.stringify(body) }
  );
  invalidateTaskCache();
  return toItem(created, list);
}

export async function updateTask(
  id: string,
  input: TaskInput
): Promise<TodoTaskItem> {
  const { listId, taskId } = splitId(id);
  const body: Record<string, unknown> = {};

  if (input.title !== undefined) body.title = input.title;
  if (input.notes !== undefined)
    body.body = { content: input.notes ?? "", contentType: "text" };
  if (input.done !== undefined)
    body.status = input.done ? "completed" : "notStarted";
  if (input.priority !== undefined)
    body.importance = PRIORITY_TO_IMPORTANCE[input.priority] ?? "normal";
  if (input.dueDate !== undefined)
    body.dueDateTime = input.dueDate
      ? {
          dateTime: new Date(input.dueDate).toISOString().slice(0, 19),
          timeZone: "UTC",
        }
      : null;
  if (input.isAstro !== undefined) {
    // categories is a full-array replace — merge with the current value.
    const current = await graphJson<GraphTask>(
      `/me/todo/lists/${listId}/tasks/${taskId}?$select=categories`
    );
    const cats = new Set(current.categories ?? []);
    if (input.isAstro) cats.add(ASTRO_CATEGORY);
    else cats.delete(ASTRO_CATEGORY);
    body.categories = [...cats];
  }

  const updated = await graphJson<GraphTask>(
    `/me/todo/lists/${listId}/tasks/${taskId}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );

  // Graph can't move a task between lists — recreate + delete.
  if (input.projectId && input.projectId !== listId) {
    const lists = await listLists();
    const target = lists.find((l) => l.id === input.projectId);
    if (target) {
      const moved = await createTask({
        title: updated.title,
        notes: updated.body?.content ?? null,
        priority: IMPORTANCE_TO_PRIORITY[updated.importance] ?? 0,
        dueDate: updated.dueDateTime?.dateTime ?? null,
        projectId: target.id,
        isAstro: (updated.categories ?? []).includes(ASTRO_CATEGORY),
      });
      if (updated.status === "completed")
        await updateTask(moved.id, { done: true });
      await deleteTask(id);
      return moved;
    }
  }

  const list = await graphJson<GraphList>(`/me/todo/lists/${listId}`);
  invalidateTaskCache();
  return toItem(updated, list);
}

export async function deleteTask(id: string): Promise<void> {
  const { listId, taskId } = splitId(id);
  const res = await graphFetch(`/me/todo/lists/${listId}/tasks/${taskId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404)
    throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 300)}`);
  invalidateTaskCache();
}

/** Shared 503 for routes when the integration isn't set up. */
export function msftGuard(): Response | null {
  if (!msftConfigured())
    return Response.json(
      { error: "msft-not-configured", message: "Set MSFT_CLIENT_ID in .env" },
      { status: 503 }
    );
  return null;
}

/** Map thrown errors to a Response for the task routes. */
export function msftError(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  const status = msg === "msft-not-connected" ? 503 : 502;
  return Response.json({ error: msg }, { status });
}
