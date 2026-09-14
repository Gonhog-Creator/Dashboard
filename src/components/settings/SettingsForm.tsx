"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SETTING_KEYS } from "@/lib/settings";

const FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: SETTING_KEYS.observerLat, label: "Latitude", placeholder: "40.7128" },
  { key: SETTING_KEYS.observerLon, label: "Longitude", placeholder: "-74.0060" },
  { key: SETTING_KEYS.observerName, label: "Location name", placeholder: "Backyard" },
  { key: SETTING_KEYS.fitsScanPath, label: "FITS scan path", placeholder: "D:\\Astro\\Lights" },
];

export function SettingsForm({
  initial,
  authEnabled,
}: {
  initial: Record<string, string>;
  authEnabled: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (res.ok) toast.success("Settings saved");
    else toast.error("Save failed");
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Auth: {authEnabled ? "Google OAuth enabled" : "disabled (no AUTH_GOOGLE_* env vars)"}.
        Calendar credentials live in <code>.env</code>.
      </p>
      <div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
