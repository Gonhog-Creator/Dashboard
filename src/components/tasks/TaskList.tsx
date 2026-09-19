"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskForm } from "./TaskForm";

export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  done: boolean;
  priority: number;
  dueDate: string | null;
  isAstro: boolean;
  project: { id: string; name: string; color: string | null } | null;
}

const PRIORITY_LABEL = ["", "low", "med", "high"] as const;

function readCache(key: string): TaskItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

export function TaskList({
  filter,
  showForm = true,
  emptyText = "Nothing due.",
  initialTasks,
  isAstro,
}: {
  filter?: string; // e.g. "done=false&due=today"
  showForm?: boolean;
  emptyText?: string;
  /** Server-rendered snapshot — paints instantly, still refreshes in background. */
  initialTasks?: TaskItem[] | null;
  /** Tag tasks created here with the "astro" category. */
  isAstro?: boolean;
}) {
  const cacheKey = `tasks-cache:${filter ?? "all"}`;
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks ?? []);
  const [loading, setLoading] = useState(!initialTasks);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks${filter ? `?${filter}` : ""}`);
    if (res.ok) {
      const data: TaskItem[] = await res.json();
      setTasks(data);
      setError(null);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        /* quota — ignore */
      }
    } else {
      setError(
        res.status === 503
          ? "Microsoft To Do isn't connected — link it in Settings."
          : "Couldn't load tasks."
      );
    }
    setLoading(false);
  }, [filter, cacheKey]);

  // Group by To Do list, like the app — "Tasks" first, then alphabetical.
  const groups = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      const name = t.project?.name ?? "Tasks";
      const arr = m.get(name) ?? [];
      arr.push(t);
      m.set(name, arr);
    }
    return [...m.entries()].sort(([a], [b]) =>
      a === "Tasks" ? -1 : b === "Tasks" ? 1 : a.localeCompare(b)
    );
  }, [tasks]);

  useEffect(() => {
    // Paint cached tasks immediately, then refresh from To Do in the background.
    // Server-rendered initialTasks already painted — skip the localStorage read.
    if (!initialTasks) {
      // Defer the localStorage paint out of the synchronous effect body.
      queueMicrotask(() => {
        const cached = readCache(cacheKey);
        if (cached.length) {
          setTasks(cached);
          setLoading(false);
        }
      });
    }
    queueMicrotask(() => void load());
  }, [load, cacheKey, initialTasks]);

  async function toggle(task: TaskItem) {
    setTasks((ts) =>
      ts.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t))
    );
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    load();
  }

  async function remove(id: string) {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-2">
      {showForm && (!error || tasks.length > 0) && (
        <TaskForm onCreated={load} isAstro={isAstro} />
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error && tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {groups.map(([name, items]) => (
            <div key={name} className="mt-3 first:mt-0">
              <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {name}
              </p>
              <ul className="flex flex-col">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={t.done}
                      onCheckedChange={() => toggle(t)}
                      aria-label={`Complete ${t.title}`}
                    />
                    <span
                      className={cn(
                        "flex-1 text-sm truncate",
                        t.done && "line-through text-muted-foreground"
                      )}
                    >
                      {t.title}
                    </span>
                    {t.priority > 0 && (
                      <Badge
                        variant={t.priority === 3 ? "destructive" : "secondary"}
                        className="text-[10px] px-1.5"
                      >
                        {PRIORITY_LABEL[t.priority]}
                      </Badge>
                    )}
                    {t.dueDate && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(t.dueDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 opacity-0 group-hover:opacity-100"
                      onClick={() => remove(t.id)}
                      aria-label={`Delete ${t.title}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {error && tasks.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {error} Showing cached.
        </p>
      )}
    </div>
  );
}
