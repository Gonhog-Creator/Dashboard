import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  type Transaction as PlaidTransaction,
} from "plaid";
import { prisma, ensureWal } from "@/lib/db";
import { categorizeBatch } from "./categorize";
import { dedupeHash } from "./dedupe";

/** Plaid client — env: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox|production). */

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

let _client: PlaidApi | null = null;
export function plaidClient(): PlaidApi {
  if (!_client) {
    const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
    _client = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
            "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
          },
        },
      })
    );
  }
  return _client;
}

export async function createLinkToken(): Promise<string> {
  const res = await plaidClient().linkTokenCreate({
    user: { client_user_id: "dashboard-user" },
    client_name: "Command Center",
    products: [Products.Transactions, Products.Investments],
    country_codes: [CountryCode.Us],
    language: "en",
  });
  return res.data.link_token;
}

export async function exchangePublicToken(publicToken: string) {
  const res = await plaidClient().itemPublicTokenExchange({
    public_token: publicToken,
  });
  return res.data; // { access_token, item_id }
}

const PORTALS: Record<string, string> = {
  "first citizens": "https://www.firstcitizens.com",
  fidelity: "https://www.fidelity.com",
  coinbase: "https://www.coinbase.com",
};

function guessPortal(name: string): string | null {
  const n = name.toLowerCase();
  for (const [k, v] of Object.entries(PORTALS)) if (n.includes(k)) return v;
  return null;
}

function mapAccountType(type: string, subtype?: string | null): string {
  if (type === "depository")
    return subtype === "savings" ? "savings" : "checking";
  if (type === "credit") return "credit_card";
  if (type === "investment") return "investment";
  if (type === "loan") return "loan";
  return "other";
}

/** After Link success: persist item, institution, accounts; run first sync. */
export async function savePlaidItem(itemId: string, accessToken: string) {
  await ensureWal();
  const itemRes = await plaidClient().itemGet({ access_token: accessToken });
  const instId = itemRes.data.item.institution_id;
  let instName = "Connected Institution";
  if (instId) {
    try {
      const inst = await plaidClient().institutionsGetById({
        institution_id: instId,
        country_codes: [CountryCode.Us],
      });
      instName = inst.data.institution.name;
    } catch {
      /* keep fallback name */
    }
  }

  const institution = await prisma.finInstitution.upsert({
    where: { id: instId ?? `plaid-${itemId}` },
    update: { name: instName },
    create: {
      id: instId ?? `plaid-${itemId}`,
      name: instName,
      type: instName.toLowerCase().includes("coinbase")
        ? "crypto"
        : instName.toLowerCase().includes("fidelity")
          ? "brokerage"
          : "bank",
      portalUrl: guessPortal(instName),
    },
  });

  await prisma.plaidItem.upsert({
    where: { itemId },
    update: { accessToken, institutionId: institution.id, status: "ok" },
    create: { itemId, accessToken, institutionId: institution.id },
  });

  // Accounts
  const acctRes = await plaidClient().accountsGet({ access_token: accessToken });
  for (const a of acctRes.data.accounts) {
    await prisma.finAccount.upsert({
      where: { id: `plaid-${a.account_id}` },
      update: {
        name: a.name,
        mask: a.mask ?? null,
        type: mapAccountType(a.type, a.subtype),
        subtype: a.subtype ?? null,
        currentBalance: a.balances.current ?? null,
        balanceUpdatedAt: new Date(),
      },
      create: {
        id: `plaid-${a.account_id}`,
        institutionId: institution.id,
        plaidAccountId: a.account_id,
        name: a.name,
        mask: a.mask ?? null,
        type: mapAccountType(a.type, a.subtype),
        subtype: a.subtype ?? null,
        currentBalance: a.balances.current ?? null,
        balanceUpdatedAt: new Date(),
      },
    });
  }

  return { institution: instName, accounts: acctRes.data.accounts.length };
}

/** Incremental transactions/sync for one item. Returns counts. */
export async function syncItem(itemId: string): Promise<string> {
  const item = await prisma.plaidItem.findUnique({
    where: { itemId },
    include: { institution: true },
  });
  if (!item) throw new Error(`unknown plaid item ${itemId}`);

  const client = plaidClient();
  let cursor = item.cursor ?? undefined;
  const added: PlaidTransaction[] = [];
  const removed: string[] = [];

  // Paginate the sync cursor.
  for (;;) {
    const res = await client.transactionsSync({
      access_token: item.accessToken,
      cursor,
      count: 500,
    });
    added.push(...res.data.added);
    removed.push(...res.data.removed.map((r) => r.transaction_id).filter(Boolean) as string[]);
    cursor = res.data.next_cursor;
    if (!res.data.has_more) break;
  }

  // Map plaid account ids → our FinAccount ids
  const accounts = await prisma.finAccount.findMany({
    where: { institutionId: item.institutionId },
    select: { id: true, plaidAccountId: true, type: true },
  });
  const acctMap = new Map(accounts.map((a) => [a.plaidAccountId, a.id]));
  const typeMap = new Map(accounts.map((a) => [a.plaidAccountId, a.type]));
  const LIABILITY = new Set(["credit_card", "loan"]);

  const parsed = added
    .filter((t) => acctMap.has(t.account_id))
    .map((t) => {
      const primary = t.personal_finance_category?.primary ?? null;
      return {
        accountId: acctMap.get(t.account_id)!,
        plaidTransactionId: t.transaction_id,
        date: new Date(t.authorized_date ?? t.date),
        description: t.name,
        merchantName: t.merchant_name ?? null,
        // Plaid: positive = money out → flip to our convention (negative = out)
        amount: -t.amount,
        plaidCategory: t.personal_finance_category?.detailed ?? null,
        // Plaid tags card payments "INCOME" — on a liability account a
        // positive amount is a payment/refund, never income.
        transactionType:
          primary === "INCOME" && LIABILITY.has(typeMap.get(t.account_id) ?? "")
            ? "payment"
            : primary,
        status: t.pending ? "pending" : "posted",
        source: "plaid",
      };
    });

  const categorized = await categorizeBatch(parsed);
  const rows = categorized.map((t) => ({
    ...t,
    dedupeHash: dedupeHash(t.accountId, t.date, t.amount, t.description),
  }));

  // Dedupe: skip rows whose plaidTransactionId or dedupeHash already exists.
  const plaidIds = rows.map((r) => r.plaidTransactionId);
  const hashes = rows.map((r) => r.dedupeHash);
  const [existingPlaid, existingHash] = await Promise.all([
    prisma.finTransaction.findMany({
      where: { plaidTransactionId: { in: plaidIds } },
      select: { plaidTransactionId: true },
    }),
    prisma.finTransaction.findMany({
      where: { dedupeHash: { in: hashes } },
      select: { dedupeHash: true },
    }),
  ]);
  const plaidSet = new Set(existingPlaid.map((e) => e.plaidTransactionId));
  const hashSet = new Set(existingHash.map((e) => e.dedupeHash));
  const fresh = rows.filter(
    (r) => !plaidSet.has(r.plaidTransactionId) && !hashSet.has(r.dedupeHash)
  );

  if (fresh.length > 0) {
    await prisma.finTransaction.createMany({ data: fresh });
  }
  if (removed.length > 0) {
    await prisma.finTransaction.deleteMany({
      where: { plaidTransactionId: { in: removed } },
    });
  }

  // Refresh balances
  try {
    const bal = await client.accountsBalanceGet({ access_token: item.accessToken });
    for (const a of bal.data.accounts) {
      const id = acctMap.get(a.account_id);
      if (!id) continue;
      await prisma.finAccount.update({
        where: { id },
        data: {
          currentBalance: a.balances.current ?? null,
          balanceUpdatedAt: new Date(),
        },
      });
    }
  } catch (e) {
    console.warn(`[plaid] balance refresh failed for ${item.institution.name}`, e);
  }

  // Pull investment holdings for items that have investment accounts.
  let holdingsCount = 0;
  const hasInvestment = accounts.some((a) => a.type === "investment");
  if (hasInvestment) {
    try {
      const inv = await client.investmentsHoldingsGet({
        access_token: item.accessToken,
      });
      const secMap = new Map(
        inv.data.securities.map((s) => [s.security_id, s])
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ourIds = inv.data.accounts
        .map((a) => acctMap.get(a.account_id))
        .filter(Boolean) as string[];
      if (ourIds.length > 0) {
        await prisma.finHolding.deleteMany({
          where: { accountId: { in: ourIds }, source: "plaid" },
        });
        const rows = inv.data.holdings
          .filter((h) => acctMap.has(h.account_id))
          .map((h) => {
            const sec = secMap.get(h.security_id);
            return {
              accountId: acctMap.get(h.account_id)!,
              symbol: sec?.ticker_symbol ?? null,
              description: sec?.name ?? null,
              quantity: h.quantity ?? null,
              price: h.institution_price ?? sec?.close_price ?? null,
              value: h.institution_value ?? null,
              costBasis: h.cost_basis ?? null,
              asOf: today,
              source: "plaid",
            };
          });
        if (rows.length > 0) {
          await prisma.finHolding.createMany({ data: rows });
          holdingsCount = rows.length;
        }
      }
    } catch (e) {
      console.warn(
        `[plaid] holdings fetch failed for ${item.institution.name}`,
        e
      );
    }
  }

  await prisma.plaidItem.update({
    where: { itemId },
    data: { cursor, status: "ok" },
  });

  return `${item.institution.name}: +${fresh.length} tx, -${removed.length} removed${holdingsCount ? `, ${holdingsCount} holdings` : ""}`;
}

/** Sync all connected items. Used by cron + manual refresh. */
export async function syncAllItems(): Promise<string> {
  if (!plaidConfigured()) return "plaid not configured";
  const items = await prisma.plaidItem.findMany({ select: { itemId: true } });
  const results: string[] = [];
  for (const it of items) {
    try {
      results.push(await syncItem(it.itemId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.plaidItem.update({
        where: { itemId: it.itemId },
        data: { status: msg.includes("ITEM_LOGIN_REQUIRED") ? "login_required" : "error" },
      });
      results.push(`${it.itemId}: error — ${msg}`);
    }
  }
  return results.length ? results.join("; ") : "no plaid items connected";
}
