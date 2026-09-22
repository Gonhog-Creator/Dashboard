"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import {
  Plug,
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate } from "@/lib/finance/format";

interface PlaidState {
  configured: boolean;
  env: string;
  items: {
    itemId: string;
    institution: string;
    portalUrl: string | null;
    status: string;
    connectedAt: string;
  }[];
}

interface ImportRow {
  id: string;
  filename: string;
  fileType: string;
  rowCount: number;
  skipped: number;
  uploadedAt: string;
  account: { name: string } | null;
}

interface AccountOpt {
  id: string;
  name: string;
}

export function ConnectionsPanel({ onChanged }: { onChanged: () => void }) {
  const [plaid, setPlaid] = useState<PlaidState | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [targetAccount, setTargetAccount] = useState("auto");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/finance/plaid").then((r) => r.json()).then(setPlaid).catch(() => {});
    fetch("/api/finance/imports").then((r) => r.json()).then((d) => setImports(d.imports ?? [])).catch(() => {});
    fetch("/api/finance/accounts")
      .then((r) => r.json())
      .then((d) =>
        setAccounts(
          (d.institutions ?? []).flatMap((i: { accounts: AccountOpt[] }) => i.accounts)
        )
      )
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  // Fetch a link token once we know Plaid is configured.
  useEffect(() => {
    if (plaid?.configured && !linkToken) {
      fetch("/api/finance/plaid/link-token", { method: "POST" })
        .then((r) => r.json())
        .then((d) => d.linkToken && setLinkToken(d.linkToken))
        .catch(() => {});
    }
  }, [plaid?.configured, linkToken]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string | null) => {
      if (!publicToken) return;
      setBusy(true);
      setMessage("Exchanging token…");
      try {
        const res = await fetch("/api/finance/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });
        const data = await res.json();
        setMessage(
          res.ok
            ? `Connected ${data.institution} — ${data.accounts} accounts. ${data.sync ?? ""}`
            : `Connect failed: ${data.error}`
        );
        setLinkToken(null); // fetch a fresh token for the next link
        load();
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [load, onChanged]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  async function uploadFiles(files: FileList | File[]) {
    setBusy(true);
    setMessage(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      if (targetAccount !== "auto") form.append("accountId", targetAccount);
      try {
        const res = await fetch("/api/finance/import", { method: "POST", body: form });
        const data = await res.json();
        setMessage(
          res.ok
            ? `${file.name}: ${data.inserted} imported (${data.skipped} dupes skipped) → ${data.accountName}`
            : `${file.name}: ${data.error}`
        );
      } catch {
        setMessage(`${file.name}: upload failed`);
      }
    }
    setBusy(false);
    load();
    onChanged();
  }

  async function deleteImport(id: string) {
    await fetch(`/api/finance/imports?id=${id}`, { method: "DELETE" });
    load();
    onChanged();
  }

  async function disconnect(itemId: string) {
    await fetch(`/api/finance/plaid?itemId=${itemId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Plaid connections */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Plug className="size-4" /> Connected institutions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plaid?.items.map((item) => (
            <div
              key={item.itemId}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {item.status === "ok" ? (
                  <CheckCircle2 className="size-4 text-green-500" />
                ) : (
                  <XCircle className="size-4 text-yellow-500" />
                )}
                <span className="text-sm font-medium">{item.institution}</span>
                {item.portalUrl && (
                  <a href={item.portalUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3 text-muted-foreground hover:text-foreground" />
                  </a>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => disconnect(item.itemId)}
              >
                Disconnect
              </Button>
            </div>
          ))}

          {plaid && !plaid.configured && (
            <p className="text-xs text-muted-foreground">
              Plaid not configured. Set <code>PLAID_CLIENT_ID</code>,{" "}
              <code>PLAID_SECRET</code>, <code>PLAID_ENV=production</code> in{" "}
              <code>.env</code> and restart.
            </p>
          )}

          <Button
            onClick={() => open()}
            disabled={!ready || busy || !plaid?.configured}
            className="w-full"
          >
            <Plug /> {busy ? "Connecting…" : "Connect a bank (Plaid)"}
          </Button>
          <p className="text-xs text-muted-foreground">
            First Citizens, Fidelity, and Coinbase are all supported. Free Trial plan
            allows up to 10 connections.
          </p>
        </CardContent>
      </Card>

      {/* File import */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Upload className="size-4" /> Import statements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragging ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"
            }`}
          >
            <Upload className="mb-2 size-6 text-muted-foreground" />
            <p className="text-sm">Drop CSV, OFX, QFX, QBO, or PDF statements</p>
            <p className="text-xs text-muted-foreground">
              Fidelity positions & activity CSVs auto-detected
            </p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".csv,.ofx,.qfx,.qbo,.pdf"
              className="hidden"
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Import into:</span>
            <Select value={targetAccount} onValueChange={(v) => setTargetAccount(v ?? "auto")}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect account</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>

      {/* Import history */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Import history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {imports.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No files imported yet.
            </p>
          )}
          {imports.map((imp) => (
            <div
              key={imp.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{imp.filename}</span>
                <Badge variant="outline" className="text-[10px]">{imp.fileType}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{imp.account?.name ?? "—"}</span>
                <span className="tabular-nums">
                  {imp.rowCount} rows{imp.skipped > 0 && `, ${imp.skipped} dupes`}
                </span>
                <span>{fmtDate(imp.uploadedAt)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteImport(imp.id)}
                  title="Delete import + its transactions"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
