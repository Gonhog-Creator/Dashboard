"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { fmtMoneyCompact } from "@/lib/finance/format";

export interface FinanceWidgetData {
  netWorth: number;
  monthSpend: number;
  monthIncome: number;
  savingsRate: number | null;
  verdicts: string[];
  accountCount: number;
}

export function FinanceWidget({ initialData }: { initialData: FinanceWidgetData | null }) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    if (data) return;
    fetch("/api/finance/overview")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [data]);

  if (!data || data.accountCount === 0) {
    return (
      <Link
        href="/finance"
        className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Wallet className="size-5" />
        <span className="text-xs">Set up Finance →</span>
      </Link>
    );
  }

  const rate = data.savingsRate;
  const good = rate != null && rate >= 0.2;

  return (
    <Link href="/finance" className="block h-full">
      <div className="flex h-full flex-col justify-between gap-1">
        <div>
          <p className="text-xs text-muted-foreground">Net worth</p>
          <p className="text-xl font-semibold tabular-nums">
            {fmtMoneyCompact(data.netWorth)}
          </p>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Spent {fmtMoneyCompact(data.monthSpend)} · In {fmtMoneyCompact(data.monthIncome)}
          </span>
          {rate != null && (
            <span
              className={`flex items-center gap-0.5 font-medium ${
                good ? "text-green-400" : "text-yellow-500"
              }`}
            >
              {good ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {(rate * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {data.verdicts[0] && (
          <p className="truncate text-[11px] text-muted-foreground">
            {data.verdicts[0]}
          </p>
        )}
      </div>
    </Link>
  );
}
