"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface Cat {
  id: string;
  name: string;
  color: string;
  keywords: string | null;
  isIncome: boolean;
  transactionCount: number;
}

/** Category configuration modal — rename, recolor, edit keywords, add/delete.
 *  Text fields save on blur; color/income save immediately. */
export function CategorySettings({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");

  useEffect(() => {
    if (!open) return;
    fetch("/api/finance/categories")
      .then((r) => r.json())
      .then((d) => setCats(d.categories ?? []))
      .catch(() => setCats([]));
  }, [open]);

  async function save(id: string, patch: Record<string, unknown>) {
    setCats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch("/api/finance/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    onChanged();
  }

  async function remove(cat: Cat) {
    const msg =
      cat.transactionCount > 0
        ? `Delete "${cat.name}"? ${cat.transactionCount} transactions will become uncategorized.`
        : `Delete "${cat.name}"?`;
    if (!window.confirm(msg)) return;
    setCats((prev) => prev.filter((c) => c.id !== cat.id));
    await fetch(`/api/finance/categories?id=${cat.id}`, { method: "DELETE" });
    onChanged();
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/finance/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: newColor }),
    });
    if (res.ok) {
      const cat = await res.json();
      setCats((prev) =>
        [...prev, { ...cat, transactionCount: 0 }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setNewName("");
      onChanged();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-[2rem_8rem_1fr_4.5rem_2rem] items-center gap-2 px-1 pb-1 text-[11px] text-muted-foreground">
            <span />
            <span>Name</span>
            <span>Keywords (comma-separated)</span>
            <span className="text-center">Income</span>
            <span />
          </div>
          {cats.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[2rem_8rem_1fr_4.5rem_2rem] items-center gap-2"
            >
              <input
                type="color"
                value={c.color}
                onChange={(e) =>
                  setCats((prev) =>
                    prev.map((x) =>
                      x.id === c.id ? { ...x, color: e.target.value } : x
                    )
                  )
                }
                onBlur={(e) => save(c.id, { color: e.target.value })}
                className="size-7 cursor-pointer rounded border border-border bg-transparent p-0.5"
                title="Category color"
              />
              <Input
                value={c.name}
                onChange={(e) =>
                  setCats((prev) =>
                    prev.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x
                    )
                  )
                }
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name) save(c.id, { name });
                }}
                className="h-8"
              />
              <Input
                defaultValue={c.keywords ?? ""}
                onBlur={(e) => save(c.id, { keywords: e.target.value || null })}
                placeholder="keywords…"
                className="h-8 text-xs"
              />
              <div className="flex justify-center">
                <Checkbox
                  checked={c.isIncome}
                  onCheckedChange={(v) => save(c.id, { isIncome: v === true })}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove(c)}
                title={
                  c.transactionCount > 0
                    ? `Delete (${c.transactionCount} txs → uncategorized)`
                    : "Delete"
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}

          {/* Add new */}
          <div className="grid grid-cols-[2rem_8rem_1fr_4.5rem_2rem] items-center gap-2 border-t border-border pt-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="size-7 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New category"
              className="h-8"
            />
            <span />
            <span />
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={add}
              disabled={!newName.trim()}
              title="Add category"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Deleting a category leaves its transactions uncategorized. Keywords
          drive auto-categorization; your manual choices are learned as rules.
        </p>
      </DialogContent>
    </Dialog>
  );
}
