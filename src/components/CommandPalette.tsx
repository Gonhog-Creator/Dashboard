"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  FileText,
  GitBranch,
  Home,
  ListTodo,
  MessageSquare,
  Play,
  Plus,
  Settings,
  Telescope,
  Timer,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { toast } from "sonner";
import type { JobStatus } from "@/types";

const PAGES = [
  { href: "/", label: "Today", icon: Home },
  { href: "/astro", label: "Astro", icon: Telescope },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/github", label: "GitHub", icon: GitBranch },
  { href: "/jobs", label: "Jobs", icon: Timer },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Load job list each time the palette opens so triggers stay fresh.
  useEffect(() => {
    if (!open) return;
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => setJobs([]));
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const runJob = useCallback(async (key: string, name: string) => {
    setOpen(false);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (res.ok) {
      toast.success(`${name} finished`);
    } else {
      const d = await res.json().catch(() => null);
      toast.error(`${name} failed${d?.message ? `: ${d.message}` : ""}`);
    }
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page or run a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGES.map(({ href, label, icon: Icon }) => (
            <CommandItem
              key={href}
              value={`go ${label}`}
              onSelect={() => go(href)}
            >
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="new task" onSelect={() => go("/tasks")}>
            <Plus />
            New task
            <CommandShortcut>/tasks</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        {jobs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Run job">
              {jobs.map((j) => (
                <CommandItem
                  key={j.key}
                  value={`run job ${j.name}`}
                  onSelect={() => runJob(j.key, j.name)}
                  disabled={!j.enabled}
                >
                  <Play />
                  {j.name}
                  <CommandShortcut>{j.schedule}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
