"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cake,
  CheckSquare,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  initials,
  REL_TYPES,
  type PersonDetailData,
  type PersonLinkItem,
  type PersonListItem,
  type PersonTaskItem,
  type RelationshipItem,
} from "./types";
import { PersonForm } from "./PersonForm";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
}

interface TodoTask {
  id: string;
  title: string;
  done: boolean;
}

export function PersonDetail({
  personId,
  onClose,
  onChanged,
  onOpenPerson,
}: {
  personId: string | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const [person, setPerson] = useState<PersonDetailData | null>(null);
  const [editing, setEditing] = useState(false);
  const [allPeople, setAllPeople] = useState<PersonListItem[]>([]);

  const load = useCallback(async () => {
    if (!personId) return;
    const res = await fetch(`/api/people/${personId}`);
    if (res.ok) setPerson(await res.json());
  }, [personId]);

  useEffect(() => {
    setPerson(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!personId) return;
    fetch("/api/people")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAllPeople)
      .catch(() => {});
  }, [personId]);

  async function remove() {
    if (!person) return;
    await fetch(`/api/people/${person.id}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  const meetHref = person?.meetUrl || "https://meet.new";

  return (
    <>
      <Sheet open={personId !== null} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {person && (
            <>
              <SheetHeader>
                <div className="flex items-start gap-3">
                  <Avatar className="size-12">
                    {person.avatarUrl && <AvatarImage src={person.avatarUrl} />}
                    <AvatarFallback>{initials(person.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <SheetTitle>{person.name}</SheetTitle>
                    {(person.role || person.company) && (
                      <p className="text-sm text-muted-foreground">
                        {[person.role, person.company].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<a href={meetHref} target="_blank" rel="noreferrer" />}
                  >
                    <Video /> Meet
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive ml-auto"
                    onClick={remove}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </SheetHeader>

              <div className="px-4 pb-6 space-y-5">
                <InfoRows person={person} />

                <Separator />

                <Relationships
                  person={person}
                  allPeople={allPeople}
                  onChanged={() => {
                    load();
                    onChanged();
                  }}
                  onOpenPerson={onOpenPerson}
                />

                <Separator />

                <Links person={person} onChanged={load} />

                <Separator />

                <Tasks person={person} onChanged={load} />

                {person.notes && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Notes
                      </h3>
                      <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
                    </section>
                  </>
                )}

                {Object.keys(person.customFields).length > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Custom fields
                      </h3>
                      <dl className="space-y-1">
                        {Object.entries(person.customFields).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-sm">
                            <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
                            <dd className="min-w-0">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <PersonForm
        open={editing}
        person={person}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
          onChanged();
        }}
      />
    </>
  );
}

function InfoRows({ person }: { person: PersonDetailData }) {
  const rows = [
    { icon: Mail, value: person.email, href: person.email ? `mailto:${person.email}` : null },
    { icon: Phone, value: person.phone, href: person.phone ? `tel:${person.phone}` : null },
    { icon: MapPin, value: person.location, href: null },
    { icon: Cake, value: person.birthday, href: null },
  ].filter((r) => r.value);
  if (rows.length === 0 && person.tags.length === 0) return null;
  return (
    <section className="space-y-1.5">
      {rows.map(({ icon: Icon, value, href }) => (
        <div key={value} className="flex items-center gap-2 text-sm">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          {href ? (
            <a href={href} className="truncate hover:underline">
              {value}
            </a>
          ) : (
            <span className="truncate">{value}</span>
          )}
        </div>
      ))}
      {person.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {person.tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function Relationships({
  person,
  allPeople,
  onChanged,
  onOpenPerson,
}: {
  person: PersonDetailData;
  allPeople: PersonListItem[];
  onChanged: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const [toId, setToId] = useState("");
  const [type, setType] = useState<string>("friend");
  const [label, setLabel] = useState("");

  const candidates = allPeople.filter((p) => p.id !== person.id);

  async function add() {
    if (!toId) return;
    await fetch(`/api/people/${person.id}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toId, type, label: label || null }),
    });
    setToId("");
    setLabel("");
    onChanged();
  }

  async function remove(relId: string) {
    await fetch(`/api/people/relationships/${relId}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Relationships
      </h3>
      <ul className="mb-2 space-y-1">
        {person.relationships.map((r: RelationshipItem) => (
          <li key={r.id} className="group flex items-center gap-2 text-sm">
            <Badge variant="outline" className="text-[10px] capitalize">
              {r.type}
            </Badge>
            <button
              className="truncate hover:underline"
              onClick={() => onOpenPerson(r.personId)}
            >
              {r.personName}
            </button>
            {r.label && (
              <span className="truncate text-xs text-muted-foreground">
                — {r.label}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto opacity-0 group-hover:opacity-100"
              onClick={() => remove(r.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
        {person.relationships.length === 0 && (
          <li className="text-xs text-muted-foreground">None yet.</li>
        )}
      </ul>
      <div className="flex items-center gap-1.5">
        <Select value={type} onValueChange={(v) => setType(v as string)}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REL_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={toId} onValueChange={(v) => setToId(v as string)}>
          <SelectTrigger size="sm" className="flex-1">
            <SelectValue placeholder="Person…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="note"
          className="h-7 w-20 text-xs"
        />
        <Button size="icon-sm" variant="outline" onClick={add} disabled={!toId}>
          <Plus />
        </Button>
      </div>
    </section>
  );
}

function Links({
  person,
  onChanged,
}: {
  person: PersonDetailData;
  onChanged: () => void;
}) {
  const [driveQ, setDriveQ] = useState("");
  const [results, setResults] = useState<DriveFile[]>([]);
  const [searching, setSearching] = useState(false);
  const [driveErr, setDriveErr] = useState<string | null>(null);
  const [urlTitle, setUrlTitle] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!driveQ.trim()) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      setDriveErr(null);
      try {
        const res = await fetch(`/api/people/drive?q=${encodeURIComponent(driveQ)}`);
        const data = await res.json();
        if (res.ok) setResults(data);
        else setDriveErr(data.message ?? "Drive search failed");
      } catch {
        setDriveErr("Drive search failed");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [driveQ]);

  async function attachDrive(f: DriveFile) {
    await fetch(`/api/people/${person.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: f.name,
        url: f.url,
        kind: "drive",
        fileId: f.id,
        mimeType: f.mimeType,
      }),
    });
    setDriveQ("");
    setResults([]);
    onChanged();
  }

  async function attachUrl() {
    if (!urlValue.trim()) return;
    await fetch(`/api/people/${person.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: urlTitle.trim() || urlValue.trim(),
        url: urlValue.trim(),
        kind: "url",
      }),
    });
    setUrlTitle("");
    setUrlValue("");
    onChanged();
  }

  async function remove(linkId: string) {
    await fetch(`/api/people/links/${linkId}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Links &amp; notes
      </h3>
      <ul className="mb-2 space-y-1">
        {person.links.map((l: PersonLinkItem) => (
          <li key={l.id} className="group flex items-center gap-2 text-sm">
            {l.kind === "drive" ? (
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="truncate hover:underline"
            >
              {l.title}
            </a>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto opacity-0 group-hover:opacity-100"
              onClick={() => remove(l.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
        {person.links.length === 0 && (
          <li className="text-xs text-muted-foreground">None yet.</li>
        )}
      </ul>

      <Input
        value={driveQ}
        onChange={(e) => setDriveQ(e.target.value)}
        placeholder="Search Google Drive…"
        className="mb-1.5 h-7 text-xs"
      />
      {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
      {driveErr && <p className="text-xs text-destructive">{driveErr}</p>}
      {results.length > 0 && (
        <ul className="mb-2 max-h-36 overflow-y-auto rounded-md border border-border">
          {results.map((f) => (
            <li key={f.id}>
              <button
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => attachDrive(f)}
              >
                <FileText className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <Plus className="ml-auto size-3 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          value={urlTitle}
          onChange={(e) => setUrlTitle(e.target.value)}
          placeholder="title"
          className="h-7 w-24 text-xs"
        />
        <Input
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          placeholder="https://…"
          className="h-7 flex-1 text-xs"
        />
        <Button size="icon-sm" variant="outline" onClick={attachUrl} disabled={!urlValue.trim()}>
          <Plus />
        </Button>
      </div>
    </section>
  );
}

function Tasks({
  person,
  onChanged,
}: {
  person: PersonDetailData;
  onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<PersonTaskItem[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([]);
  const [attachId, setAttachId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/people/${person.id}/tasks`);
    if (res.ok) setTasks(await res.json());
    else setTasks([]);
  }, [person.id]);

  useEffect(() => {
    load();
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : []))
      .then((all: TodoTask[]) => setTodoTasks(all.filter((t) => !t.done)))
      .catch(() => setTodoTasks([]));
  }, [load]);

  async function createAndLink() {
    const title = newTitle.trim() || `Meet with ${person.name}`;
    setErr(null);
    const res = await fetch(`/api/people/${person.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setNewTitle("");
      load();
      onChanged();
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? "failed");
    }
  }

  async function attach() {
    if (!attachId) return;
    const res = await fetch(`/api/people/${person.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: attachId }),
    });
    if (res.ok) {
      setAttachId("");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? "failed");
    }
  }

  async function unlink(linkId: string) {
    await fetch(`/api/people/tasks/${linkId}`, { method: "DELETE" });
    load();
    onChanged();
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        To Do tasks
      </h3>
      <ul className="mb-2 space-y-1">
        {(tasks ?? []).map((t) => (
          <li key={t.linkId} className="group flex items-center gap-2 text-sm">
            {t.done ? (
              <CheckSquare className="size-3.5 shrink-0 text-primary" />
            ) : (
              <Square className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={t.done ? "truncate line-through text-muted-foreground" : "truncate"}>
              {t.title}
            </span>
            {t.missing && (
              <span className="text-[10px] text-muted-foreground">(deleted)</span>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto opacity-0 group-hover:opacity-100"
              onClick={() => unlink(t.linkId)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
        {tasks !== null && tasks.length === 0 && (
          <li className="text-xs text-muted-foreground">None linked.</li>
        )}
      </ul>

      <div className="mb-1.5 flex items-center gap-1.5">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={`Meet with ${person.name}`}
          className="h-7 flex-1 text-xs"
          onKeyDown={(e) => e.key === "Enter" && createAndLink()}
        />
        <Button size="sm" variant="outline" className="h-7" onClick={createAndLink}>
          <Plus /> Create
        </Button>
      </div>
      {todoTasks.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Select value={attachId} onValueChange={(v) => setAttachId(v as string)}>
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue placeholder="Attach existing task…" />
            </SelectTrigger>
            <SelectContent>
              {todoTasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-7" onClick={attach} disabled={!attachId}>
            Link
          </Button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
    </section>
  );
}
