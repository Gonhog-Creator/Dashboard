"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, ChevronLeft, ChevronRight, Tag, ArrowUp, ArrowDown, ArrowUpDown, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtDate } from "@/lib/finance/format";
import { CategorySettings } from "./CategorySettings";

interface Tx {
  id: string;
  date: string;
  description: string;
  merchantName: string | null;
  amount: number;
  status: string;
  isRecurring: boolean;
  source: string;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string; mask: string | null; type: string; institution: { name: string } };
}

interface Category {
  id: string;
  name: string;
  color: string;
}

interface AccountOpt {
  id: string;
  name: string;
}

export function TransactionsPanel({ refreshKey }: { refreshKey: number }) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [accountId, setAccountId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [type, setType] = useState("all");
  const [uncategorized, setUncategorized] = useState(false);
  // date = newest first; date_asc; amount_desc; amount_asc
  const [sort, setSort] = useState("date");
  const [catSettingsOpen, setCatSettingsOpen] = useState(false);

  useEffect(() => {
    if (q === qDebounced) return; // mount + post-fetch state — no timer needed
    const t = setTimeout(() => {
      setQDebounced(q);
      setPage(1);
      setLoading(true);
    }, 300);
    return () => clearTimeout(t);
  }, [q, qDebounced]);

  const loadCats = useCallback(() => {
    fetch("/api/finance/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    loadCats();
    fetch("/api/finance/accounts")
      .then((r) => r.json())
      .then((d) =>
        setAccounts(
          (d.institutions ?? []).flatMap((i: { accounts: AccountOpt[] }) => i.accounts)
        )
      );
  }, [refreshKey, loadCats]);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: "50", sort });
    if (qDebounced) params.set("q", qDebounced);
    if (accountId !== "all") params.set("accountId", accountId);
    if (categoryId !== "all") params.set("categoryId", categoryId);
    if (type !== "all") params.set("type", type);
    if (uncategorized) params.set("uncategorized", "1");
    fetch(`/api/finance/transactions?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setTxs(d.transactions ?? []);
        setTotal(d.total ?? 0);
        setPages(d.pages ?? 1);
      })
      .finally(() => setLoading(false));
  }, [page, qDebounced, accountId, categoryId, type, uncategorized, sort]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  /** Event-handler helper: reset to page 1 + show loading on filter changes. */
  function onFilter() {
    setPage(1);
    setLoading(true);
  }

  function toggleSort(field: "date" | "amount") {
    setSort((s) => {
      if (field === "date") return s === "date" ? "date_asc" : "date";
      return s === "amount_desc" ? "amount_asc" : "amount_desc";
    });
    onFilter();
  }

  function sortIcon(field: "date" | "amount") {
    const active =
      field === "date" ? sort.startsWith("date") : sort.startsWith("amount");
    if (!active) return <ArrowUpDown className="size-3 opacity-40" />;
    const isAsc = field === "date" ? sort === "date_asc" : sort === "amount_asc";
    return isAsc ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );
  }

  const allSelected = txs.length > 0 && txs.every((t) => selected.has(t.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) txs.forEach((t) => next.delete(t.id));
      else txs.forEach((t) => next.add(t.id));
      return next;
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyCategory(catId: string) {
    if (selected.size === 0) return;
    await fetch("/api/finance/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], categoryId: catId }),
    });
    setSelected(new Set());
    setLoading(true);
    load();
  }

  const uncategorizedCount = useMemo(
    () => txs.filter((t) => !t.category).length,
    [txs]
  );

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search… use "!fee" to exclude'
            className="pl-8 pr-8"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select value={accountId} onValueChange={(v) => { setAccountId(v ?? "all"); onFilter(); }}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {(v: string) =>
                v === "all"
                  ? "All accounts"
                  : (accounts.find((a) => a.id === v)?.name ?? "All accounts")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v ?? "all"); onFilter(); }}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {(v: string) =>
                v === "all"
                  ? "All categories"
                  : (categories.find((c) => c.id === v)?.name ?? "All categories")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v ?? "all"); onFilter(); }}>
          <SelectTrigger className="w-32">
            <SelectValue>
              {(v: string) =>
                v === "income" ? "Income" : v === "expense" ? "Expenses" : "All"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="expense">Expenses</SelectItem>
            <SelectItem value="income">Income</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={uncategorized ? "default" : "outline"}
          onClick={() => { setUncategorized((v) => !v); onFilter(); }}
        >
          Uncategorized{uncategorizedCount > 0 && ` (${uncategorizedCount})`}
        </Button>
        <Button
          size="sm"
          variant={sort === "similarity" ? "default" : "outline"}
          onClick={() => { setSort((s) => (s === "similarity" ? "date" : "similarity")); onFilter(); }}
        >
          Group similar
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          onClick={() => setCatSettingsOpen(true)}
          title="Configure categories"
        >
          <Settings className="size-4" />
        </Button>
      </div>

      <CategorySettings
        open={catSettingsOpen}
        onOpenChange={setCatSettingsOpen}
        onChanged={() => {
          loadCats();
          setLoading(true);
          load();
        }}
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
          <Tag className="size-4 text-primary" />
          <span className="text-sm">{selected.size} selected</span>
          <Select onValueChange={(v) => { if (typeof v === "string") applyCategory(v); }}>
            <SelectTrigger className="w-48 h-8">
              <SelectValue placeholder="Set category…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead className="w-24">
                <button
                  type="button"
                  onClick={() => toggleSort("date")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Date {sortIcon("date")}
                </button>
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40">Account</TableHead>
              <TableHead className="w-36">Category</TableHead>
              <TableHead className="w-28 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("amount")}
                  className="ml-auto flex items-center gap-1 hover:text-foreground"
                >
                  Amount {sortIcon("amount")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-32 w-full" />
                </TableCell>
              </TableRow>
            ) : txs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              txs.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => toggle(t.id)}
                  data-state={selected.has(t.id) ? "selected" : undefined}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(t.id)}
                      onCheckedChange={() => toggle(t.id)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(t.date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-96">
                        {t.merchantName ?? t.description}
                      </span>
                      {t.isRecurring && (
                        <Badge variant="outline" className="text-[10px] px-1">recurring</Badge>
                      )}
                      {t.status === "pending" && (
                        <Badge variant="outline" className="text-[10px] px-1">pending</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.account.name}
                    {t.account.mask && ` ··${t.account.mask}`}
                  </TableCell>
                  <TableCell>
                    {t.category ? (
                      <Badge
                        variant="outline"
                        style={{ borderColor: t.category.color, color: t.category.color }}
                        className="text-[11px]"
                      >
                        {t.category.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      t.amount > 0 ? "text-green-400" : ""
                    }`}
                  >
                    {fmtMoney(t.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total.toLocaleString()} transactions</span>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="size-7"
            disabled={page <= 1}
            onClick={() => { setPage((p) => p - 1); setLoading(true); }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tabular-nums">{page} / {pages || 1}</span>
          <Button
            size="icon"
            variant="outline"
            className="size-7"
            disabled={page >= pages}
            onClick={() => { setPage((p) => p + 1); setLoading(true); }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
