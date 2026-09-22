/** Smoke test for the finance import pipeline. Usage:
 *  npx tsx scripts/smoke-finance.ts <file1> [file2 ...]
 *  npx tsx scripts/smoke-finance.ts --overview
 */
import { readFileSync, readdirSync } from "fs";
import { basename } from "path";
import { importStatement } from "../src/lib/finance/import";
import { parseStatement } from "../src/lib/finance/parsers";
import { getFinanceOverview } from "../src/lib/finance/overview";
import { detectRecurring } from "../src/lib/finance/recurring";
import { plaidConfigured, createLinkToken, syncAllItems } from "../src/lib/finance/plaid";
import { learnCategory } from "../src/lib/finance/categorize";
import { upsertCryptoHolding, refreshCryptoPrices } from "../src/lib/finance/crypto";
import { snapshotBalances } from "../src/lib/finance/snapshots";
import { portfolioValueSeries, netWorthSeries } from "../src/lib/finance/history";
import { prisma } from "../src/lib/db";

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--importdir") {
    const files = readdirSync(args[1]).filter((f) =>
      /\.(pdf|csv|ofx|qfx|qbo)$/i.test(f)
    );
    console.log(`${files.length} files`);
    for (const f of files.sort()) {
      try {
        const r = await importStatement(f, readFileSync(`${args[1]}/${f}`));
        console.log(
          `${f}  ->  ${r.accountName || "(snapshots)"}  +${r.inserted} -${r.skipped}`
        );
      } catch (e) {
        console.log(`${f}  !!  ${e instanceof Error ? e.message : e}`);
      }
    }
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--pdftext") {
    const { extractText } = await import("unpdf");
    const { text } = await extractText(
      new Uint8Array(readFileSync(args[1])),
      { mergePages: true }
    );
    const full = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    const n = Number(args[2] ?? 120);
    console.log(full.split("\n").slice(0, n).join("\n"));
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--pdfpos") {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(args[1])));
    const pageNo = Number(args[2] ?? 1);
    const page = await pdf.getPage(pageNo);
    const tc = await page.getTextContent();
    // Cluster items into rows by y (transform[5]), sort by x (transform[4]).
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const key = [...rows.keys()].find((k) => Math.abs(k - y) < 3) ?? y;
      const arr = rows.get(key) ?? [];
      arr.push({ x, s: it.str });
      rows.set(key, arr);
    }
    for (const [y, items] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      console.log(
        `y=${String(y).padStart(4)}  ` +
          items.sort((a, b) => a.x - b.x).map((i) => `[${i.x.toFixed(0)}]${i.s}`).join(" ")
      );
    }
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--parse") {
    const file = args[1];
    const out = await parseStatement(basename(file), readFileSync(file));
    console.log({
      kind: out.kind,
      institution: out.institutionHint,
      accountType: out.accountType,
      txs: out.transactions.length,
      positions: out.positions.length,
      snapshots: out.snapshots?.map((s) => ({
        acct: s.accountHint,
        date: s.date.toISOString().slice(0, 10),
        balance: s.balance,
      })),
    });
    for (const t of out.transactions.slice(0, 8)) {
      console.log(`  ${t.date}  ${String(t.amount).padStart(10)}  ${t.description.slice(0, 50)}`);
    }
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--dupes") {
    const txs = await prisma.finTransaction.findMany({
      select: {
        date: true, amount: true, description: true, source: true,
        account: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    });
    let n = 0;
    for (let i = 0; i < txs.length; i++) {
      for (let j = i + 1; j < txs.length; j++) {
        const a = txs[i], b = txs[j];
        const dd = Math.abs(a.date.getTime() - b.date.getTime()) / 86400000;
        if (dd > 3) break;
        if (
          a.account.name === b.account.name &&
          a.amount === b.amount &&
          a.source !== b.source
        ) {
          n++;
          if (n <= 40) {
            console.log(
              `${a.account.name} ${a.date.toISOString().slice(0, 10)} ${a.amount}  [${a.source}] ${a.description.slice(0, 35)}  <->  [${b.source}] ${b.description.slice(0, 35)}`
            );
          }
        }
      }
    }
    console.log(`${n} cross-source same-amount pairs within 3 days`);
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--fixdupes") {
    // Remove pdf-source txs that dupe a plaid tx (same acct+amount, ±3 days).
    const pdfTxs = await prisma.finTransaction.findMany({
      where: { source: "pdf" },
      select: { id: true, accountId: true, date: true, amount: true, description: true },
    });
    const plaidTxs = await prisma.finTransaction.findMany({
      where: { source: "plaid" },
      select: { accountId: true, date: true, amount: true },
    });
    const used = new Set<number>();
    const toDelete: string[] = [];
    for (const p of pdfTxs) {
      const idx = plaidTxs.findIndex(
        (o, i) =>
          !used.has(i) &&
          o.accountId === p.accountId &&
          o.amount === p.amount &&
          Math.abs(o.date.getTime() - p.date.getTime()) <= 3 * 86400000
      );
      if (idx >= 0) {
        used.add(idx);
        toDelete.push(p.id);
      }
    }
    console.log(`deleting ${toDelete.length} pdf dupes`);
    await prisma.finTransaction.deleteMany({ where: { id: { in: toDelete } } });
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--nw") {
    const s = await netWorthSeries();
    console.log(`${s.length} points`);
    let prev: number | null = null;
    for (const p of s) {
      const d = prev == null ? 0 : p.value - prev;
      if (Math.abs(d) > 500 || prev == null) {
        console.log(`${p.date}  ${p.value.toFixed(0).padStart(8)}  ${d >= 0 ? "+" : ""}${d.toFixed(0)}`);
      }
      prev = p.value;
    }
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--transfers") {
    const txs = await prisma.finTransaction.findMany({
      where: {
        OR: [
          { transactionType: { contains: "transfer" } },
          { transactionType: { contains: "TRANSFER" } },
          { transactionType: { contains: "LOAN_PAYMENTS" } },
          { transactionType: "payment" },
          { category: { name: "Transfer" } },
        ],
      },
      select: {
        date: true, description: true, amount: true,
        transactionType: true, plaidCategory: true,
        category: { select: { name: true } },
        account: { select: { name: true, institution: { select: { name: true } } } },
      },
      orderBy: { date: "desc" },
    });
    console.log(`${txs.length} transfer-like txs`);
    // Group by normalized description to spot recurring pairs
    const groups = new Map<string, { n: number; total: number; sample: string; accts: Set<string> }>();
    for (const t of txs) {
      const key = t.description.replace(/\d+/g, "#").slice(0, 40);
      const g = groups.get(key) ?? { n: 0, total: 0, sample: t.description, accts: new Set() };
      g.n++;
      g.total += t.amount;
      g.accts.add(`${t.account.institution.name}/${t.account.name}`);
      groups.set(key, g);
    }
    console.log(
      [...groups.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([k, g]) => ({ pattern: k, count: g.n, total: Math.round(g.total), accounts: [...g.accts] }))
    );
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--growth") {
    const s = await portfolioValueSeries();
    console.log({
      points: s.length,
      first: s[0],
      last: s[s.length - 1],
      sample: s.filter((_, i) => i % 30 === 0),
    });
    await prisma.$disconnect();
    return;
  }

  // --addkw "Category Name" "kw1,kw2" — append keywords for future auto-categorize
  if (args[0] === "--addkw") {
    const cat = await prisma.finCategory.findFirst({
      where: { name: { equals: args[1] } },
    });
    if (!cat) throw new Error(`no category ${args[1]}`);
    const merged = [...new Set(
      `${cat.keywords ?? ""},${args[2]}`.split(",").map((k) => k.trim()).filter(Boolean)
    )].join(",");
    await prisma.finCategory.update({
      where: { id: cat.id },
      data: { keywords: merged },
    });
    console.log(`${cat.name} keywords: ${merged}`);
    await prisma.$disconnect();
    return;
  }

  // --learn "description substring" "Category Name"
  if (args[0] === "--learn") {
    const cat = await prisma.finCategory.findFirst({
      where: { name: { equals: args[2] } },
    });
    if (!cat) throw new Error(`no category ${args[2]}`);
    await learnCategory(args[1], cat.id);
    console.log(`learned "${args[1]}" -> ${cat.name}`);
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--income") {
    const days = parseInt(args[1] ?? "30", 10);
    const since = new Date(Date.now() - days * 86400000);
    const txs = await prisma.finTransaction.findMany({
      where: { amount: { gt: 0 }, date: { gte: since } },
      select: {
        date: true, description: true, amount: true,
        transactionType: true, plaidCategory: true,
        category: { select: { name: true, isIncome: true } },
        account: { select: { name: true } },
      },
      orderBy: { amount: "desc" },
      take: 40,
    });
    console.log(`${txs.length} positive txs in last ${days}d`);
    console.log(txs.map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      desc: t.description.slice(0, 45),
      amt: t.amount,
      type: t.transactionType,
      plaidCat: t.plaidCategory,
      cat: t.category?.name ?? null,
      acct: t.account.name,
    })));
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--accounts") {
    const accts = await prisma.finAccount.findMany({
      include: {
        institution: { select: { name: true } },
        _count: { select: { transactions: true, holdings: true } },
      },
    });
    console.log(
      accts.map((a) => ({
        inst: a.institution.name,
        name: a.name,
        type: a.type,
        bal: a.currentBalance,
        tx: a._count.transactions,
        holdings: a._count.holdings,
      }))
    );
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--sync") {
    console.log(await syncAllItems());
    console.log(await refreshCryptoPrices());
    console.log(await snapshotBalances());
    const bySource = await prisma.finTransaction.groupBy({
      by: ["source"],
      _count: true,
    });
    console.log("transactions by source:", bySource);
    await prisma.$disconnect();
    return;
  }

  // --crypto BTC:0.5 ETH:2.1:3000  (qty, optional cost basis per unit)
  if (args[0] === "--crypto") {
    for (const spec of args.slice(1)) {
      const [sym, qty, cb] = spec.split(":");
      const r = await upsertCryptoHolding(
        sym,
        parseFloat(qty),
        cb ? parseFloat(cb) : undefined
      );
      console.log(r);
    }
    console.log(await refreshCryptoPrices());
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--plaid") {
    console.log("configured:", plaidConfigured());
    const token = await createLinkToken();
    console.log("link_token:", token.slice(0, 30) + "...");
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--clean-test") {
    // Remove everything the smoke test imported (fake CSVs + test positions file).
    const files = [
      "checking_account_fake.csv",
      "credit_card_fake.csv",
      "Statement3312026.csv",
    ];
    const imports = await prisma.finImport.findMany({
      where: { filename: { in: files } },
      select: { id: true, accountId: true },
    });
    const importIds = imports.map((i) => i.id);
    const accountIds = [...new Set(imports.map((i) => i.accountId).filter(Boolean))] as string[];

    const delTx = await prisma.finTransaction.deleteMany({
      where: { OR: [{ importId: { in: importIds } }, { accountId: { in: accountIds } }] },
    });
    const delHold = await prisma.finHolding.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    const delImp = await prisma.finImport.deleteMany({
      where: { id: { in: importIds } },
    });
    const delAcct = await prisma.finAccount.deleteMany({
      where: { id: { in: accountIds } },
    });
    // Institutions left with no accounts and no Plaid item are test artifacts.
    const orphans = await prisma.finInstitution.findMany({
      where: { accounts: { none: {} }, plaidItem: null },
      select: { id: true, name: true },
    });
    const delInst = await prisma.finInstitution.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });
    console.log({
      transactions: delTx.count,
      holdings: delHold.count,
      imports: delImp.count,
      accounts: delAcct.count,
      institutions: delInst.count,
      removedInstitutions: orphans.map((o) => o.name),
    });
    // Rebuild recurring streams from remaining (real) data.
    console.log("recurring:", await detectRecurring());
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--categories") {
    const total = await prisma.finTransaction.count();
    const cat = await prisma.finTransaction.count({
      where: { categoryId: { not: null } },
    });
    const cats = await prisma.finCategory.findMany({
      select: { name: true, _count: { select: { transactions: true } } },
      orderBy: { name: "asc" },
    });
    console.log({ total, categorized: cat, pct: Math.round((cat / total) * 100) });
    console.log(
      cats
        .filter((c) => c._count.transactions > 0)
        .map((c) => `${c.name}:${c._count.transactions}`)
        .join(", ")
    );
    await prisma.$disconnect();
    return;
  }

  if (args[0] === "--overview") {
    const o = await getFinanceOverview();
    console.log(JSON.stringify({
      netWorth: o.netWorth,
      monthSpend: o.monthSpend,
      monthIncome: o.monthIncome,
      prevSpend: o.prevSpend,
      prevIncome: o.prevIncome,
      savingsRate: o.savingsRate,
      netWorthPoints: o.netWorthSeries.length,
      netWorthFirst: o.netWorthSeries[0],
      netWorthLast: o.netWorthSeries[o.netWorthSeries.length - 1],
      categories: o.categories.slice(0, 5),
      verdicts: o.verdicts,
      accountCount: o.accountCount,
    }, null, 2));
    const rec = await detectRecurring();
    console.log("recurring:", rec);
    await prisma.$disconnect();
    return;
  }

  for (const file of args) {
    const buf = readFileSync(file);
    const res = await importStatement(basename(file), buf);
    console.log(res);
  }

  const [txCount, acctCount, holdCount] = await Promise.all([
    prisma.finTransaction.count(),
    prisma.finAccount.count(),
    prisma.finHolding.count(),
  ]);
  console.log({ txCount, acctCount, holdCount });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
