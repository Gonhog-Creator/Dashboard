"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** Friendly labels for known keys — the env name stays unchanged. */
const LABELS: Record<string, string> = {
  CALDAV_USERNAME: "Apple ID email",
  CALDAV_APP_PASSWORD: "Apple ID app-specific password",
};

interface Row {
  key: string;
  value: string;
  secret: boolean;
  hasValue: boolean;
  /** New rows get editable keys; existing keys are locked. */
  isNew: boolean;
}

export function EnvEditor() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/env");
    const data = await res.json();
    setRows(
      (data.entries as Omit<Row, "isNew">[]).map((e) => ({ ...e, isNew: false }))
    );
  }

  useEffect(() => {
    load().catch(() => setRows([]));
  }, []);

  async function save() {
    if (!rows) return;
    const bad = rows.find((r) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(r.key));
    if (bad) {
      toast.error(`Invalid key: "${bad.key || "(empty)"}"`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/env", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: rows.map((r) => ({
            key: r.key,
            // Secret rows left blank keep their existing value server-side.
            value: r.secret && !r.isNew && r.value === "" ? null : r.value,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(".env saved — restart the app for changes to apply");
      await load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (rows === null) return null;

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-2/5">
            <Input
              value={r.key}
              readOnly={!r.isNew}
              placeholder="KEY"
              className="h-7 font-mono text-xs"
              onChange={(e) =>
                setRows((rs) =>
                  rs!.map((x, j) =>
                    j === i ? { ...x, key: e.target.value } : x
                  )
                )
              }
            />
            {LABELS[r.key] && (
              <span className="text-[10px] text-muted-foreground">
                {LABELS[r.key]}
              </span>
            )}
          </div>
          <Input
            value={r.value}
            type={r.secret ? "password" : "text"}
            placeholder={r.secret && r.hasValue ? "••• set •••" : "value"}
            className="h-7 flex-1 font-mono text-xs"
            onChange={(e) =>
              setRows((rs) =>
                rs!.map((x, j) =>
                  j === i ? { ...x, value: e.target.value } : x
                )
              )
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setRows((rs) => rs!.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            setRows((rs) => [
              ...rs!,
              { key: "", value: "", secret: false, hasValue: false, isNew: true },
            ])
          }
        >
          <Plus /> Add variable
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save .env"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Secrets are never displayed — leave a secret field blank to keep its
        current value. Changes apply after restarting the app.
      </p>
    </div>
  );
}
