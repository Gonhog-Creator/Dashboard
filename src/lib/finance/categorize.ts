import { prisma, ensureWal } from "@/lib/db";
import { normalizeForGroup } from "./dedupe";

/** Port of BudgetTool categorization.py + user_preferences.py, DB-backed via FinRule. */

interface DefaultCategory {
  name: string;
  color: string;
  isIncome?: boolean;
  keywords: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Income", color: "#22c55e", isIncome: true, keywords: "salary,payroll,direct dep,direct deposit,refund,reimbursement,interest paid,dividend received" },
  { name: "Groceries", color: "#84cc16", keywords: "grocery,supermarket,whole foods,trader joe,kroger,safeway,harris teeter,food lion,aldi,publix,wegmans,lidl" },
  { name: "Food", color: "#f97316", keywords: "restaurant,cafe,diner,grill,bistro,eatery,mcdonald,starbucks,burger king,subway,chick-fil-a,taco bell,wendy,doordash,uber eats,grubhub,pizza,dunkin" },
  { name: "Gas", color: "#eab308", keywords: "shell,exxon,chevron,bp ,circle k,sheetz,quiktrip,wawa,speedway,marathon,sunoco,valero,gas station,fuel,7-eleven fuel" },
  { name: "Shopping", color: "#a78bfa", keywords: "amazon,walmart,target,costco,best buy,ebay,sam's club,sams club,home depot,lowes,ikea" },
  { name: "Entertainment", color: "#ec4899", keywords: "netflix,spotify,hulu,disney,youtube,cinema,movie,concert,ticketmaster" },
  { name: "Gaming", color: "#6366f1", keywords: "gaming,steam,playstation,xbox,nintendo,epic games,blizzard,riot games,gamestop,twitch,battle.net" },
  { name: "Exercise", color: "#2dd4bf", keywords: "gym,fitness,planet fitness,ymca,peloton,crossfit,orangetheory,yoga,climbing,golf" },
  { name: "Housing", color: "#f43f5e", keywords: "rent,mortgage,hoa,property tax,home insurance" },
  { name: "Health", color: "#34d399", keywords: "pharmacy,cvs,walgreens,doctor,hospital,dental,medical,health" },
  { name: "Subscriptions", color: "#c084fc", keywords: "subscription,membership,icloud,google storage,openai,chatgpt,patreon" },
  { name: "Travel", color: "#fb923c", keywords: "airline,united,delta,american airlines,hotel,airbnb,marriott,hilton,expedia,booking" },
  { name: "Transfer", color: "#64748b", keywords: "transfer,zelle,venmo,paypal transfer,ach transfer,online transfer,electronic pmt,pmt-thank,payment thank" },
  { name: "Fees", color: "#ef4444", keywords: "fee,service charge,overdraft,atm fee,late fee,annual fee" },
  { name: "Investments", color: "#10b981", keywords: "fidelity,vanguard,brokerage,contribution,401k,ira" },
];

/** Insert any missing default categories. Idempotent. */
export async function seedCategories() {
  await ensureWal();
  const existing = await prisma.finCategory.findMany({ select: { name: true } });
  const have = new Set(existing.map((c) => c.name.toLowerCase()));
  const missing = DEFAULT_CATEGORIES.filter((d) => !have.has(d.name.toLowerCase()));
  if (missing.length === 0) return;
  await prisma.finCategory.createMany({
    data: missing.map((d) => ({
      name: d.name,
      color: d.color,
      keywords: d.keywords,
      isIncome: d.isIncome ?? false,
    })),
  });
}

/** Plaid personal_finance_category (detailed) → our category name. */
const PLAID_MAP: Record<string, string> = {
  INCOME_WAGES: "Income",
  INCOME_OTHER_INCOME: "Income",
  INCOME_DIVIDENDS: "Income",
  INCOME_INTEREST_EARNED: "Income",
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_RESTAURANT: "Food",
  FOOD_AND_DRINK_FAST_FOOD: "Food",
  FOOD_AND_DRINK_COFFEE: "Food",
  TRANSPORTATION_GAS: "Gas",
  GENERAL_MERCHANDISE_SUPERSTORES: "Shopping",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "Shopping",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Entertainment",
  ENTERTAINMENT_TV_AND_MOVIES: "Entertainment",
  ENTERTAINMENT_VIDEO_GAMES: "Gaming",
  HOME_IMPROVEMENT_HARDWARE: "Shopping",
  RENT_AND_UTILITIES_RENT: "Housing",
  RENT_AND_UTILITIES_MORTGAGE: "Housing",
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "Health",
  MEDICAL_PRIMARY_CARE: "Health",
  MEDICAL_DENTAL_CARE: "Health",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Exercise",
  TRAVEL_FLIGHTS: "Travel",
  TRAVEL_LODGING: "Travel",
  TRANSFER_OUT: "Transfer",
  TRANSFER_IN: "Transfer",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Transfer",
  BANK_FEES: "Fees",
};

export function plaidCategoryToOurs(detailed?: string | null): string | undefined {
  if (!detailed) return undefined;
  if (PLAID_MAP[detailed]) return PLAID_MAP[detailed];
  // Try the primary bucket (prefix before first _)
  const primary = detailed.split("_").slice(0, 2).join("_");
  for (const [k, v] of Object.entries(PLAID_MAP)) {
    if (k.startsWith(primary)) return v;
  }
  return undefined;
}

interface CategoryRow {
  id: string;
  name: string;
  keywords: string | null;
}

function scoreKeywords(description: string, categories: CategoryRow[]): string | null {
  const desc = description.toLowerCase();
  const words = new Set(desc.split(/\s+/));
  let best: string | null = null;
  let bestScore = 0;
  for (const cat of categories) {
    if (!cat.keywords) continue;
    let score = 0;
    for (const kw of cat.keywords.split(",").map((k) => k.trim().toLowerCase())) {
      if (!kw) continue;
      if (words.has(kw)) score += 2;
      else if (desc.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat.id;
    }
  }
  return best;
}

/**
 * Categorize a batch of parsed transactions.
 * Order: learned FinRule (exact normalized desc) → keyword scoring → plaid mapping.
 */
export async function categorizeBatch<
  T extends { description: string; plaidCategory?: string | null },
>(txs: T[]): Promise<(T & { categoryId: string | null })[]> {
  await ensureWal();
  await seedCategories();
  const [categories, rules] = await Promise.all([
    prisma.finCategory.findMany({ select: { id: true, name: true, keywords: true } }),
    prisma.finRule.findMany({ select: { pattern: true, categoryId: true } }),
  ]);
  const ruleMap = new Map(rules.map((r) => [r.pattern, r.categoryId]));
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  return txs.map((tx) => {
    const norm = normalizeForGroup(tx.description);
    let categoryId = ruleMap.get(norm) ?? null;
    if (!categoryId) categoryId = scoreKeywords(tx.description, categories);
    if (!categoryId && tx.plaidCategory) {
      const name = plaidCategoryToOurs(tx.plaidCategory);
      if (name) categoryId = byName.get(name.toLowerCase()) ?? null;
    }
    return { ...tx, categoryId };
  });
}

/** Learn a rule + retro-apply to identical descriptions (BudgetTool smart-categorize). */
export async function learnCategory(description: string, categoryId: string) {
  await ensureWal();
  const pattern = normalizeForGroup(description);
  if (!pattern) return;
  await prisma.finRule.upsert({
    where: { pattern },
    update: { categoryId },
    create: { pattern, categoryId },
  });
  // Retro-apply to all transactions sharing the normalized description.
  const candidates = await prisma.finTransaction.findMany({
    where: { description: { contains: description.slice(0, 20) } },
    select: { id: true, description: true },
  });
  const ids = candidates
    .filter((c) => normalizeForGroup(c.description) === pattern)
    .map((c) => c.id);
  if (ids.length > 0) {
    await prisma.finTransaction.updateMany({
      where: { id: { in: ids } },
      data: { categoryId },
    });
  }
}
