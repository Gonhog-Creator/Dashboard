"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutGrid,
  List,
  MapPin,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { initials, type PersonListItem } from "./types";
import { BulkAddDialog } from "./BulkAddDialog";
import { PersonForm } from "./PersonForm";

type View = "tiles" | "rows";

export function DirectoryPanel({
  refreshKey,
  onSelect,
}: {
  refreshKey: number;
  onSelect: (id: string) => void;
}) {
  const [people, setPeople] = useState<PersonListItem[] | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("tiles");
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  const load = useCallback(async (query: string) => {
    const res = await fetch(
      `/api/people${query ? `?q=${encodeURIComponent(query)}` : ""}`
    );
    if (res.ok) setPeople(await res.json());
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(q), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, refreshKey, load]);

  async function importContacts(source: "google" | "apple") {
    setImporting(true);
    setImportMsg(null);
    try {
      const url =
        source === "apple"
          ? "/api/people/import-apple"
          : "/api/people/import-contacts";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setImportMsg(`${data.created} added, ${data.updated} updated`);
        load(q);
      } else {
        setImportMsg(data.message ?? data.error ?? "import failed");
      }
    } catch {
      setImportMsg("import failed");
    } finally {
      setImporting(false);
    }
  }

  async function linkFamilies() {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/people/link-families", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setImportMsg(
          data.created
            ? `${data.created} family links across ${data.families} last names`
            : "No new family links found"
        );
      } else {
        setImportMsg(data.message ?? data.error ?? "scan failed");
      }
    } catch {
      setImportMsg("scan failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, location, tag…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center rounded-md border border-border">
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(view === "tiles" && "bg-accent")}
            onClick={() => setView("tiles")}
            title="Tile view"
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(view === "rows" && "bg-accent")}
            onClick={() => setView("rows")}
            title="Row view"
          >
            <List className="size-4" />
          </Button>
        </div>
        {importMsg && (
          <span className="text-xs text-muted-foreground">{importMsg}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" disabled={importing} />
              }
            >
              <RefreshCw className={importing ? "animate-spin" : ""} />
              Import Contacts
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => importContacts("google")}>
                From Google Contacts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => importContacts("apple")}>
                From iCloud (Apple)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={linkFamilies}
            disabled={importing}
            title="Create family relationships between people sharing a last name"
          >
            <UsersRound />
            Link families
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" />}>
              <UserPlus />
              Add Person
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFormOpen(true)}>
                <UserPlus /> One person…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkOpen(true)}>
                <Users /> Bulk add…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {people === null ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : people.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {q ? "No matches." : "No people yet — add someone or import contacts."}
        </div>
      ) : view === "tiles" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {people.map((p) => (
            <PersonTile key={p.id} person={p} onClick={() => onSelect(p.id)} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {people.map((p) => (
            <PersonRow key={p.id} person={p} onClick={() => onSelect(p.id)} />
          ))}
        </div>
      )}

      <PersonForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load(q);
        }}
      />
      <BulkAddDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={(msg) => {
          setBulkOpen(false);
          setImportMsg(msg);
          load(q);
        }}
      />
    </div>
  );
}

function PersonTile({
  person,
  onClick,
}: {
  person: PersonListItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-2.5 w-full">
        <Avatar>
          {person.avatarUrl && <AvatarImage src={person.avatarUrl} />}
          <AvatarFallback>{initials(person.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{person.name}</div>
          {(person.role || person.company) && (
            <div className="truncate text-xs text-muted-foreground">
              {[person.role, person.company].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>
      {person.location && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" />
          <span className="truncate">{person.location}</span>
        </div>
      )}
      {person.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {person.tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
          {person.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{person.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function PersonRow({
  person,
  onClick,
}: {
  person: PersonListItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/50"
    >
      <Avatar size="sm">
        {person.avatarUrl && <AvatarImage src={person.avatarUrl} />}
        <AvatarFallback>{initials(person.name)}</AvatarFallback>
      </Avatar>
      <span className="w-44 truncate text-sm font-medium">{person.name}</span>
      <span className="w-44 truncate text-xs text-muted-foreground">
        {[person.role, person.company].filter(Boolean).join(" · ")}
      </span>
      <span className="w-40 truncate text-xs text-muted-foreground">
        {person.location}
      </span>
      <span className="flex-1 truncate text-xs text-muted-foreground">
        {person.email}
      </span>
      <span className="flex gap-1">
        {person.tags.slice(0, 2).map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px]">
            {t}
          </Badge>
        ))}
      </span>
    </button>
  );
}
