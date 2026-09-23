"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  CheckSquare,
  FileText,
  FlaskConical,
  GitBranch,
  Home,
  ListTodo,
  MessageSquare,
  Settings,
  Swords,
  Telescope,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Today", icon: Home },
  { href: "/astro", label: "Astro", icon: Telescope },
  { href: "/science", label: "Science Labs", icon: FlaskConical },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/people", label: "People", icon: Users },
  { href: "/coc", label: "Clash", icon: Swords },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/github", label: "GitHub", icon: GitBranch },
  { href: "/jobs", label: "Jobs", icon: Timer },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useScienceUnseen() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/science/unseen")
        .then((r) => r.json())
        .then((d) => alive && setCount(d.count ?? 0))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener("science:seen", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("science:seen", load);
    };
  }, []);
  return count;
}

export function Sidebar() {
  const pathname = usePathname();
  const scienceUnseen = useScienceUnseen();
  return (
    <aside className="sticky top-0 h-screen w-14 md:w-52 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
      <div className="flex items-center gap-2 px-3 md:px-4 h-14 border-b border-sidebar-border">
        <CheckSquare className="size-5 text-primary shrink-0" />
        <span className="hidden md:block font-semibold text-sm tracking-wide">
          Command Center
        </span>
      </div>
      <nav className="flex-1 py-3 flex flex-col gap-1 px-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active &&
                  "bg-sidebar-accent text-sidebar-foreground font-medium"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden md:block">{label}</span>
              {href === "/science" && scienceUnseen > 0 && (
                <span
                  className={cn(
                    "absolute top-1 right-1 md:static md:ml-auto",
                    "min-w-4 h-4 px-1 rounded-full",
                    "bg-emerald-500 text-emerald-950",
                    "text-[10px] font-bold leading-4 text-center",
                    "animate-pulse shadow-[0_0_8px_2px_rgba(16,185,129,0.7)]"
                  )}
                >
                  {scienceUnseen > 99 ? "99+" : scienceUnseen}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
