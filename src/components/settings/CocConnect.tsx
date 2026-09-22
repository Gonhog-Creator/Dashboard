"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const KEYS = {
  apiKey: "coc.apiKey",
  clanTag: "coc.clanTag",
  playerTag: "coc.playerTag",
  villageJson: "coc.villageJson",
} as const;

export function CocConnect({ initial }: { initial: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>({
    [KEYS.apiKey]: initial[KEYS.apiKey] ?? "",
    [KEYS.clanTag]: initial[KEYS.clanTag] ?? "",
    [KEYS.playerTag]: initial[KEYS.playerTag] ?? "",
    [KEYS.villageJson]: initial[KEYS.villageJson] ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (res.ok) toast.success("CoC settings saved");
    else toast.error("Save failed");
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/coc/sync?what=poll", { method: "POST" });
      const data = await res.json();
      if (res.ok) toast.success(data.message ?? "Connected");
      else toast.error(data.error ?? "Connection failed");
    } catch {
      toast.error("Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={KEYS.apiKey}>API key</Label>
          <Input
            id={KEYS.apiKey}
            type="password"
            value={values[KEYS.apiKey]}
            placeholder="JWT from developer.clashofclans.com"
            onChange={(e) =>
              setValues((v) => ({ ...v, [KEYS.apiKey]: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={KEYS.clanTag}>Clan tag</Label>
          <Input
            id={KEYS.clanTag}
            value={values[KEYS.clanTag]}
            placeholder="#2PP"
            onChange={(e) =>
              setValues((v) => ({ ...v, [KEYS.clanTag]: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={KEYS.playerTag}>Your player tag</Label>
          <Input
            id={KEYS.playerTag}
            value={values[KEYS.playerTag]}
            placeholder="#ABC123"
            onChange={(e) =>
              setValues((v) => ({ ...v, [KEYS.playerTag]: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={KEYS.villageJson}>Village export (paste only)</Label>
          <textarea
            id={KEYS.villageJson}
            value={values[KEYS.villageJson]}
            placeholder='In-game: Settings → More Settings → Data Export → Copy, then paste here. Powers the "Me" tab upgrade tracker.'
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(e) =>
              setValues((v) => ({ ...v, [KEYS.villageJson]: e.target.value }))
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Keys are bound to whitelisted IPs — whitelist this PC&apos;s public IP
        when creating the key. If your IP rotates, set{" "}
        <code>COC_API_BASE=https://proxy.royaleapi.dev/v1</code> in{" "}
        <code>.env</code> and whitelist <code>45.79.218.79</code> instead.
      </p>
      <a
        href="https://developer.clashofclans.com"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="size-3" />
        developer.clashofclans.com — manage API keys
      </a>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={test}
          disabled={testing}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
      </div>
    </form>
  );
}
