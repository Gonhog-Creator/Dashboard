import { prisma, ensureWal } from "@/lib/db";
import { findOrCreateInstitution } from "./import";

/** Manual crypto tracking — Coinbase's public spot-price API needs no key. */

export async function fetchSpotPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coinbase.com/v2/prices/${symbol.toUpperCase()}-USD/spot`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const amount = parseFloat(json?.data?.amount);
    return Number.isFinite(amount) ? amount : null;
  } catch {
    return null;
  }
}

/** Find or create the manual Coinbase account (institution 'Coinbase', type crypto). */
export async function coinbaseAccount() {
  const inst = await findOrCreateInstitution("Coinbase");
  const existing = await prisma.finAccount.findFirst({
    where: { institutionId: inst.id, type: "crypto" },
  });
  if (existing) return existing;
  return prisma.finAccount.create({
    data: {
      institutionId: inst.id,
      name: "Coinbase Portfolio",
      type: "crypto",
    },
  });
}

/** Upsert a holding: symbol + quantity (+ optional cost basis per unit). */
export async function upsertCryptoHolding(
  symbol: string,
  quantity: number,
  costBasisPerUnit?: number
) {
  await ensureWal();
  const account = await coinbaseAccount();
  const sym = symbol.toUpperCase();
  const price = await fetchSpotPrice(sym);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.finHolding.findFirst({
    where: { accountId: account.id, symbol: sym },
    orderBy: { asOf: "desc" },
  });
  const data = {
    accountId: account.id,
    symbol: sym,
    description: sym,
    quantity,
    price,
    value: price != null ? price * quantity : null,
    costBasis: costBasisPerUnit != null ? costBasisPerUnit * quantity : existing?.costBasis ?? null,
    asOf: today,
    source: "manual",
  };
  if (existing) {
    await prisma.finHolding.update({ where: { id: existing.id }, data });
  } else {
    await prisma.finHolding.create({ data });
  }
  await refreshAccountBalance(account.id);
  return { symbol: sym, quantity, price, value: data.value };
}

/** Re-price every manual crypto holding and update the account balance. */
export async function refreshCryptoPrices(): Promise<string> {
  await ensureWal();
  const holdings = await prisma.finHolding.findMany({
    where: { source: "manual", symbol: { not: null }, account: { type: "crypto" } },
    include: { account: { select: { id: true } } },
  });
  let updated = 0;
  for (const h of holdings) {
    const price = await fetchSpotPrice(h.symbol!);
    if (price == null) continue;
    await prisma.finHolding.update({
      where: { id: h.id },
      data: {
        price,
        value: h.quantity != null ? price * h.quantity : null,
        asOf: new Date(),
      },
    });
    updated++;
  }
  // Refresh balances on all crypto accounts.
  const accounts = await prisma.finAccount.findMany({ where: { type: "crypto" } });
  for (const a of accounts) await refreshAccountBalance(a.id);
  return `refreshed ${updated} crypto prices`;
}

async function refreshAccountBalance(accountId: string) {
  const holdings = await prisma.finHolding.findMany({
    where: { accountId },
    select: { value: true },
  });
  const total = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  await prisma.finAccount.update({
    where: { id: accountId },
    data: { currentBalance: total, balanceUpdatedAt: new Date() },
  });
}
