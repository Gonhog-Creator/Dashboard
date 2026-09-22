import { prisma, ensureWal } from "@/lib/db";
import { normalizeForGroup } from "./dedupe";
import { excludeHidden } from "./exclusions";

/** Port of BudgetTool recurring_detection.py — groups by normalized description,
 *  detects frequency from average interval, marks txs + upserts FinRecurringStream. */

const DAY = 24 * 60 * 60 * 1000;

function detectFrequency(dates: Date[]): string | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / DAY));
  }
  const avg = intervals.reduce((s, n) => s + n, 0) / intervals.length;
  if (avg >= 25 && avg <= 35) return "monthly";
  if (avg >= 6 && avg <= 9) return "weekly";
  if (avg >= 13 && avg <= 16) return "biweekly";
  if (avg >= 85 && avg <= 95) return "quarterly";
  if (avg >= 350 && avg <= 380) return "yearly";
  return null;
}

export async function detectRecurring(): Promise<string> {
  await ensureWal();
  const txs = await prisma.finTransaction.findMany({
    where: excludeHidden({ status: "posted" }),
    orderBy: { date: "asc" },
    select: {
      id: true,
      description: true,
      merchantName: true,
      amount: true,
      date: true,
      categoryId: true,
    },
  });

  const groups = new Map<string, typeof txs>();
  for (const tx of txs) {
    const key = normalizeForGroup(tx.merchantName ?? tx.description);
    if (!key) continue;
    const g = groups.get(key) ?? [];
    g.push(tx);
    groups.set(key, g);
  }

  // Reset flags, then re-mark
  await prisma.finTransaction.updateMany({ data: { isRecurring: false } });
  await prisma.finRecurringStream.deleteMany({});

  let streams = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const freq = detectFrequency(group.map((t) => t.date));
    if (!freq) continue;

    await prisma.finTransaction.updateMany({
      where: { id: { in: group.map((t) => t.id) } },
      data: { isRecurring: true },
    });

    const amounts = group.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    const variance =
      amounts.reduce((s, n) => s + Math.abs(n - avgAmount), 0) / amounts.length;
    const last = group[group.length - 1];
    const intervalDays =
      { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365 }[freq] ?? 30;

    await prisma.finRecurringStream.create({
      data: {
        description: key,
        displayName: last.merchantName ?? last.description,
        amount: variance / avgAmount < 0.1 ? avgAmount : null, // null = varies
        frequency: freq,
        lastSeen: last.date,
        nextExpected: new Date(last.date.getTime() + intervalDays * DAY),
        categoryId: last.categoryId,
      },
    });
    streams++;
  }
  return `detected ${streams} recurring streams`;
}
