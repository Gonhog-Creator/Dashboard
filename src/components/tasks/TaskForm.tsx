"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function TaskForm({
  onCreated,
  isAstro,
}: {
  onCreated?: () => void;
  isAstro?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), isAstro }),
    });
    setTitle("");
    setBusy(false);
    onCreated?.();
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        className="h-8 text-sm"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        <Plus className="size-4" />
      </Button>
    </form>
  );
}
