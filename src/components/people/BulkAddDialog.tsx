"use client";

import { useEffect, useState } from "react";
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

export function BulkAddDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [names, setNames] = useState("");
  const [location, setLocation] = useState("");
  const [company, setCompany] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNames("");
    setLocation("");
    setCompany("");
    setTags("");
    setError(null);
  }, [open]);

  const count = names
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean).length;

  async function save() {
    const list = names
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setError("Add at least one name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/people/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: list,
          location: location.trim() || null,
          company: company.trim() || null,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "failed");
      onSaved(
        `${data.created} added${data.skipped ? `, ${data.skipped} already existed` : ""}`
      );
    } catch {
      setError("Bulk add failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk add people</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="ba-names" className="mb-1 text-xs">
              Names — one per line
            </Label>
            <Textarea
              id="ba-names"
              value={names}
              onChange={(e) => setNames(e.target.value)}
              rows={8}
              placeholder={"Jane Doe\nJohn Smith\n…"}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {count} name{count === 1 ? "" : "s"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ba-location" className="mb-1 text-xs">
                Location (all)
              </Label>
              <Input
                id="ba-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Italy"
              />
            </div>
            <div>
              <Label htmlFor="ba-company" className="mb-1 text-xs">
                Company (all)
              </Label>
              <Input
                id="ba-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="ba-tags" className="mb-1 text-xs">
                Tags (all, comma-separated)
              </Label>
              <Input
                id="ba-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="family, italy-trip"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || count === 0}>
            {saving ? "Adding…" : `Add ${count || ""} people`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
