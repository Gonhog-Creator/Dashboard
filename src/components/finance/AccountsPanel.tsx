"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Landmark, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtDate } from "@/lib/finance/format";

interface Account {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  currentBalance: number | null;
  balanceUpdatedAt: string | null;
  transactionCount: number;
}

interface Institution {
  id: string;
  name: string;
  type: string;
  portalUrl: string | null;
  plaidStatus: string | null;
  accounts: Account[];
}

const TYPE_LABEL: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  investment: "Investment",
  crypto: "Crypto",
  loan: "Loan",
  other: "Other",
};

export function AccountsPanel({ refreshKey }: { refreshKey: number }) {
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);

  useEffect(() => {
    fetch("/api/finance/accounts")
      .then((r) => r.json())
      .then((d) => setInstitutions(d.institutions ?? []))
      .catch(() => setInstitutions([]));
  }, [refreshKey]);

  if (!institutions) return <Skeleton className="h-64 w-full" />;

  if (institutions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No accounts yet — connect via Plaid or import a statement below.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {institutions.map((inst) => (
        <Card key={inst.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Landmark className="size-4 text-primary" />
              {inst.name}
              {inst.plaidStatus === "login_required" && (
                <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-500 text-[10px]">
                  <AlertTriangle className="size-3" /> re-login needed
                </Badge>
              )}
              {inst.plaidStatus === "ok" && (
                <Badge variant="outline" className="border-green-600 text-green-500 text-[10px]">
                  plaid
                </Badge>
              )}
            </CardTitle>
            {inst.portalUrl && (
              <a
                href={inst.portalUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" /> Portal
              </a>
            )}
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {inst.accounts.map((a) => {
              const isLiability = a.type === "credit_card" || a.type === "loan";
              return (
                <div key={a.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {a.name}
                      {a.mask && <span className="text-muted-foreground"> ··{a.mask}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL[a.type] ?? a.type}
                      {a.subtype && a.subtype !== a.type ? ` · ${a.subtype}` : ""}
                      {" · "}{a.transactionCount.toLocaleString()} tx
                      {a.balanceUpdatedAt && ` · bal. ${fmtDate(a.balanceUpdatedAt)}`}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      isLiability && (a.currentBalance ?? 0) < 0 ? "text-green-400" : ""
                    }`}
                  >
                    {fmtMoney(a.currentBalance)}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
