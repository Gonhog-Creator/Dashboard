"use client";

import { useCallback, useEffect, useState } from "react";
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

export function TaskList({
  filter,
  showForm = true,
  emptyText = "Nothing due.",
}: {
  filter?: string; // e.g. "done=false&due=today"
  showForm?: boolean;
  emptyText?: string;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks${filter ? `?${filter}` : ""}`);
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

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
  }

  return (
    <div className="flex flex-col gap-2">
      {showForm && <TaskForm onCreated={load} />}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((t) => (
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
              {t.project && (
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {t.project.name}
                </Badge>
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
      )}
    </div>
  );
}
