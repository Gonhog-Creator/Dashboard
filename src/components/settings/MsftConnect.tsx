"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Status {
  configured: boolean;
  connected: boolean;
}

interface DeviceSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export function MsftConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [session, setSession] = useState<DeviceSession | null>(null);
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/tasks/msft")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false }));
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/msft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "start failed");
      const s = (await res.json()) as DeviceSession;
      setSession(s);
      pollTimer.current = setInterval(async () => {
        const r = await fetch("/api/tasks/msft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "poll", deviceCode: s.deviceCode }),
        });
        const { status: st } = await r.json();
        if (st === "connected") {
          stopPolling();
          setSession(null);
          setStatus({ configured: true, connected: true });
          toast.success("Microsoft To Do connected");
        } else if (st === "expired" || st === "error") {
          stopPolling();
          setSession(null);
          toast.error(
            st === "expired" ? "Code expired — try again" : "Sign-in failed"
          );
        }
      }, Math.max(s.interval, 3) * 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/tasks/msft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    setStatus((s) => (s ? { ...s, connected: false } : s));
    setBusy(false);
    toast.success("Disconnected");
  }

  if (!status) return null;

  if (!status.configured)
    return (
      <p className="text-xs text-muted-foreground">
        Microsoft To Do: not configured — set{" "}
        <code>MSFT_CLIENT_ID</code> in <code>.env</code>.
      </p>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Microsoft To Do:{" "}
          {status.connected ? "connected" : "not connected"}
        </p>
        {status.connected ? (
          <Button
            size="sm"
            variant="outline"
            onClick={disconnect}
            disabled={busy}
          >
            Disconnect
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={connect} disabled={busy}>
            {busy ? "Starting…" : "Connect"}
          </Button>
        )}
      </div>
      {session && (
        <p className="text-sm">
          Go to{" "}
          <a
            href={session.verificationUri}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {session.verificationUri}
          </a>{" "}
          and enter code{" "}
          <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-sm">
            {session.userCode}
          </code>
        </p>
      )}
    </div>
  );
}
