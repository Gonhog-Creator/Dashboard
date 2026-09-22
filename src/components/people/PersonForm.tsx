"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PersonListItem } from "./types";

interface Field {
  key: string;
  value: string;
}

export function PersonForm({
  open,
  onClose,
  onSaved,
  person,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (p: PersonListItem) => void;
  person?: PersonListItem | null;
}) {
  const [form, setForm] = useState({
    name: "",
    company: "",
    role: "",
    email: "",
    phone: "",
    location: "",
    birthday: "",
    meetUrl: "",
    avatarUrl: "",
    tags: "",
    notes: "",
  });
  const [custom, setCustom] = useState<Field[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: person?.name ?? "",
      company: person?.company ?? "",
      role: person?.role ?? "",
      email: person?.email ?? "",
      phone: person?.phone ?? "",
      location: person?.location ?? "",
      birthday: person?.birthday ?? "",
      meetUrl: person?.meetUrl ?? "",
      avatarUrl: person?.avatarUrl ?? "",
      tags: person?.tags.join(", ") ?? "",
      notes: person?.notes ?? "",
    });
    setCustom(
      Object.entries(person?.customFields ?? {}).map(([key, value]) => ({
        key,
        value,
      }))
    );
    setError(null);
  }, [open, person]);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const customFields: Record<string, string> = {};
    for (const f of custom) if (f.key.trim()) customFields[f.key.trim()] = f.value;
    const payload = {
      name: form.name.trim(),
      company: form.company || null,
      role: form.role || null,
      email: form.email || null,
      phone: form.phone || null,
      location: form.location || null,
      birthday: form.birthday || null,
      meetUrl: form.meetUrl || null,
      avatarUrl: form.avatarUrl || null,
      notes: form.notes || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      customFields,
    };
    try {
      const res = await fetch(
        person ? `/api/people/${person.id}` : "/api/people",
        {
          method: person ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      onSaved(await res.json());
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof typeof form; label: string; placeholder?: string; type?: string }[] = [
    { key: "name", label: "Name", placeholder: "Jane Doe" },
    { key: "company", label: "Company", placeholder: "Acme Corp" },
    { key: "role", label: "Role", placeholder: "Engineer" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
    { key: "location", label: "Location", placeholder: "Sydney, Australia" },
    { key: "birthday", label: "Birthday", placeholder: "1990-05-14 or 05-14" },
    { key: "meetUrl", label: "Meet URL", placeholder: "https://meet.google.com/…" },
    { key: "avatarUrl", label: "Avatar URL" },
    { key: "tags", label: "Tags", placeholder: "family, climbing, work" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div
              key={f.key}
              className={f.key === "name" || f.key === "meetUrl" || f.key === "avatarUrl" || f.key === "tags" ? "col-span-2" : ""}
            >
              <Label htmlFor={`pf-${f.key}`} className="mb-1 text-xs">
                {f.label}
              </Label>
              <Input
                id={`pf-${f.key}`}
                value={form[f.key]}
                onChange={set(f.key)}
                placeholder={f.placeholder}
                type={f.type ?? "text"}
              />
            </div>
          ))}
          <div className="col-span-2">
            <Label htmlFor="pf-notes" className="mb-1 text-xs">
              Notes
            </Label>
            <Textarea
              id="pf-notes"
              value={form.notes}
              onChange={set("notes")}
              rows={3}
            />
          </div>

          <div className="col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs">Custom fields</Label>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setCustom((c) => [...c, { key: "", value: "" }])}
              >
                <Plus /> Add field
              </Button>
            </div>
            {custom.map((f, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-1.5">
                <Input
                  value={f.key}
                  placeholder="field"
                  className="w-2/5"
                  onChange={(e) =>
                    setCustom((c) =>
                      c.map((x, j) => (j === i ? { ...x, key: e.target.value } : x))
                    )
                  }
                />
                <Input
                  value={f.value}
                  placeholder="value"
                  className="flex-1"
                  onChange={(e) =>
                    setCustom((c) =>
                      c.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setCustom((c) => c.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
