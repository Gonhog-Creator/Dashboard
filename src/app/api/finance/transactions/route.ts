import { prisma, ensureWal } from "@/lib/db";
import { normalizeForGroup } from "@/lib/finance/dedupe";
import { learnCategory } from "@/lib/finance/categorize";
import { excludeHidden } from "@/lib/finance/exclusions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** GET /api/finance/transactions?q=&accountId=&categoryId=&type=&from=&to=&page=&limit=&sort=
 *  q supports `!term` exclusion (BudgetTool convention). sort=similarity groups alike descriptions. */
export async function GET(request: Request) {
  await ensureWal();
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const accountId = url.searchParams.get("accountId");
  const categoryId = url.searchParams.get("categoryId");
  const type = url.searchParams.get("type"); // income|expense
  const uncategorized = url.searchParams.get("uncategorized") === "1";
  const recurring = url.searchParams.get("recurring") === "1";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const sort = url.searchParams.get("sort") ?? "date";

  const where: Prisma.FinTransactionWhereInput = excludeHidden({});
  if (accountId) where.accountId = accountId;
  if (categoryId) where.categoryId = categoryId;
  if (uncategorized) where.categoryId = null;
  if (recurring) where.isRecurring = true;
  if (type === "income") where.amount = { gt: 0 };
  if (type === "expense") where.amount = { lt: 0 };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setDate(end.getDate() + 1); // inclusive
      where.date.lt = end;
    }
  }

  // Search: include tokens, `!token` excludes. SQLite LIKE is case-insensitive.
  const include: string[] = [];
  const exclude: string[] = [];
  for (const tok of q.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith("!")) exclude.push(tok.slice(1));
    else include.push(tok);
  }
  if (include.length || exclude.length) {
    where.AND = [
      ...include.map((t) => ({
        OR: [
          { description: { contains: t } },
          { merchantName: { contains: t } },
        ],
      })),
      ...exclude.map((t) => ({
        NOT: {
          OR: [
            { description: { contains: t } },
            { merchantName: { contains: t } },
          ],
        },
      })),
    ];
  }

  const includeRel = {
    category: { select: { id: true, name: true, color: true } },
    account: {
      select: {
        id: true,
        name: true,
        mask: true,
        type: true,
        institution: { select: { name: true } },
      },
    },
  } satisfies Prisma.FinTransactionInclude;

  if (sort === "similarity") {
    // Group by normalized description — needs the full filtered set.
    const rows = await prisma.finTransaction.findMany({
      where,
      include: includeRel,
      orderBy: { date: "desc" },
      take: 2000,
    });
    const groupOf = (t: (typeof rows)[number]) =>
      normalizeForGroup(t.merchantName ?? t.description);
    const counts = new Map<string, number>();
    for (const r of rows) {
      const g = groupOf(r);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    rows.sort((a, b) => {
      const ga = groupOf(a);
      const gb = groupOf(b);
      return (
        (counts.get(gb) ?? 0) - (counts.get(ga) ?? 0) ||
        ga.localeCompare(gb) ||
        b.date.getTime() - a.date.getTime()
      );
    });
    const total = rows.length;
    return Response.json({
      transactions: rows.slice((page - 1) * limit, page * limit),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  }

  const [rows, total] = await Promise.all([
    prisma.finTransaction.findMany({
      where,
      include: includeRel,
      orderBy:
        sort === "amount"
          ? { amount: "asc" }
          : sort === "amount_desc"
            ? { amount: "desc" }
            : sort === "date_asc"
              ? { date: "asc" }
              : { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.finTransaction.count({ where }),
  ]);

  return Response.json({
    transactions: rows,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

/** PATCH { ids: string[], categoryId } — bulk categorize + learn rule. */
export async function PATCH(request: Request) {
  await ensureWal();
  const body = await request.json().catch(() => null);
  const ids: string[] = body?.ids ?? [];
  const categoryId: string | null = body?.categoryId ?? null;
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "ids required" }, { status: 400 });
  }

  await prisma.finTransaction.updateMany({
    where: { id: { in: ids } },
    data: { categoryId },
  });

  // Learn from the manual categorization (BudgetTool smart auto-categorize).
  if (categoryId) {
    const first = await prisma.finTransaction.findUnique({
      where: { id: ids[0] },
      select: { description: true },
    });
    if (first) await learnCategory(first.description, categoryId);
  }

  return Response.json({ updated: ids.length });
}
