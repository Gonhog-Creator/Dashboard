# Finance Tab — Architecture & Research

Status: **design only — nothing built yet**. Read-only analytics; no money movement.

## 1. Connection methods (researched 2026-09-20)

### Plaid Trial plan — recommended primary aggregator
- **Free**, real production data, auto-approved for US/CA developers (new plan replacing Limited Production for signups after 2026-04-15).
- Cap: **10 Items** (one Item = one institution login). Removing an Item does NOT free a slot.
- Products included: Transactions (+Refresh), Balance, Investments (+Refresh), Liabilities, Auth, Identity, Assets, Statements.
- Locked usage: **3 Items** — First Citizens (checking + savings + the only credit card), Fidelity, Coinbase. Well under the 10-Item cap.
- **Risk:** Fidelity may be a gated institution requiring extra access request even on paid plans (Plaid billing docs mention "request access to Fidelity"). Verify in Plaid dashboard institution search before committing; fallback = CSV import (already solved).
- Plaid Link = drop-in frontend component; access_token stored server-side.
- npm: `plaid` (server SDK) + `react-plaid-link`.

### Coinbase — via Plaid (decided 2026-09-20)
- Coinbase is a supported Plaid institution → one Item, same sync pipeline as banks.
- Alternative if a slot is ever needed: free CDP API key, read-only `view` permission, Ed25519 JWT auth (`GET /api/v3/brokerage/accounts`, fills, transaction summary). Deferred.

### First Citizens Bank — manual fallback
- Supports Quicken **Web Connect (.qfx/.qbo)** download + CSV export from digital banking; Direct Connect exists for desktop Quicken/QuickBooks.
- BudgetTool's `ofx_parser.py` already handles .ofx/.qfx/.qbo → port to TS (`ofx-js` or `node-ofx-parser`).

### Fidelity — manual fallback
- **No QFX Web Connect.** Manual export = CSV only.
- Positions: one-click CSV from Positions tab (Symbol, Qty, Last Price, Current Value, Cost Basis).
- Transactions: Activity & Orders → Download, **90-day cap per export** — stitch multiple exports for history.
- BudgetTool already has `fidelity_parser.py` (transactions) + `fidelity_position_parser.py` (positions) → port to TS (pure column-mapping logic, easy).

### Other credit cards
- If issued by First Citizens → included in that Plaid Item / QFX export.
- Other issuers (Chase/Amex/etc.) → one Plaid Item each, or manual CSV/QFX.

### Rejected / deferred
- **SimpleFIN Bridge** — $1.50/mo, MX-based. Cheap fallback if Plaid Trial doesn't pan out.
- **ofxclient / Direct Connect scripting** — brittle, credential handling risk.
- **Screen scraping (Playwright)** — fragile + MFA pain; last resort only.

## 2. Data architecture

Port to **Prisma in the dashboard DB** (single app/auth/DB — no FastAPI sidecar). BudgetTool's `budget.db` imported once via migration script or re-import of source files.

```prisma
model FinInstitution {          // 'first-citizens', 'fidelity', 'coinbase', 'manual'
  id, name, type, plaidItemId?, createdAt
}
model FinAccount {
  id, institutionId→FinInstitution, plaidAccountId?, name, mask,
  type,        // checking|savings|credit_card|investment|crypto|loan
  subtype?, currency='USD', currentBalance?, balanceUpdatedAt?, isActive
}
model FinTransaction {
  id, accountId→FinAccount, plaidTransactionId?,  // dedupe key
  date, description, merchantName?, amount,       // negative = money out
  categoryId→FinCategory?, plaidCategory?,        // keep raw + our mapping
  transactionType?, // purchase|payment|deposit|withdrawal|transfer|buy|sell|dividend|reinvest|fee|interest
  status='posted',  // posted|pending
  isRecurring, source,  // plaid|csv|ofx|pdf|manual
  dedupeHash?,    // sha1(accountId|date|amount|normDesc) — file imports + cross-source dedup
  importId→FinImport?, notes?, createdAt
  @@unique([accountId, plaidTransactionId])
  @@index([dedupeHash])
}
model FinCategory { id, name, color, keywords, parentId? }   // port of BudgetTool Category
model FinHolding {              // investment/crypto positions
  id, accountId, symbol, description?, quantity, price, value, costBasis?,
  asOf, source
}
model FinBalanceSnapshot {      // daily cron → net worth & growth charts
  id, accountId, date, balance
  @@unique([accountId, date])
}
model FinRecurringStream { id, description, amount?, frequency, nextExpected?, isActive, categoryId? }
model FinImport {               // uploaded file record (reprocess/delete cascade)
  id, filename, fileType, accountId?, rowCount, uploadedAt
}
model PlaidItem { id, itemId @unique, accessToken, institutionId, cursor?, status }
```

**History depth:** Plaid returns ~24 months of transactions max per institution. Full-history analytics (lifetime gas spend, income charts) need file-import backfill: First Citizens QFX/CSV, Fidelity 90-day-stitched CSVs, PDF statements.

**Dedup strategy:** Plaid gives stable `transaction_id`. File imports and Plaid-vs-file overlap dedupe via `dedupeHash` on `(accountId, date, amount, normalizedDescription)`. BudgetTool lacks this; add it.

## 3. Ingestion layer (`src/lib/finance/`)

- `plaid.ts` — client, link-token create, public-token exchange, `/transactions/sync` cursor walk, investments refresh.
- `coinbase.ts` — DEFERRED (Coinbase goes through Plaid). Direct CDP API remains an option.
- `parsers/` — TS ports: `csv.ts` (papaparse + column auto-map), `ofx.ts`, `fidelity.ts`, `fidelityPositions.ts`, `pdf.ts` (pdf-parse; weakest port — keep optional).
- `categorize.ts` — keyword auto-categorization (port of `categorization.py`); Plaid's personal_finance_category as fallback mapping into our categories.
- `recurring.ts` — port of `recurring_detection.py` (or use Plaid's recurring streams endpoint — included in Trial).
- `snapshots.ts` — daily balance/holding snapshot writer.

**Cron jobs** (existing node-cron scheduler): `finance-sync` (Plaid transactions refresh + Coinbase poll, ~4h), `finance-snapshot` (daily 11pm).

## 4. API routes (`/api/finance/`)

- `GET /api/finance/overview` — net worth, month spend/income, savings rate, MoM deltas
- `GET /api/finance/accounts` · `GET /api/finance/transactions` (filter/search/paginate)
- `GET /api/finance/analytics/spending` (by category/month) · `/cashflow` · `/investments` (growth series)
- `POST /api/finance/import` (file upload → parser factory) · `GET/DELETE /api/finance/imports`
- `POST /api/finance/plaid/link-token` · `POST /api/finance/plaid/exchange` · `DELETE /api/finance/plaid/[itemId]`
- `POST /api/finance/sync` (manual refresh)
- `GET/PUT /api/finance/categories` · `POST /api/finance/transactions/[id]/category` (bulk-capable)

## 5. Frontend (`/finance` route)

Sub-tabs (mirroring BudgetTool, restyled dark-first + shadcn):
- **Overview** — net worth line, income vs spend bars, category donut, top merchants, recurring list, verdicts ("spending up 12% vs 3-mo avg")
- **Accounts** — grouped by institution, balances + staleness, connect buttons
- **Transactions** — port of `Transactions.tsx` (search `!exclude`, bulk categorize, similarity sort)
- **Investments** — holdings table, allocation donut, growth chart from snapshots
- **Recurring** — detected subscriptions/bills
- **Explorer** — arbitrary analytics over full history: pick category/keyword/account → time-series chart (lifetime gas spend, income by month, etc.)
- **Connections** — Plaid Link button, file upload dropzone, import history
- **Quick links** — outbound portal links: firstcitizens.com, fidelity.com, coinbase.com

Main-grid widget `FinanceWidget`: net worth + month spend + savings-rate verdict; click → `/finance`.

## 6. Reuse from BudgetTool

| Piece | Verdict |
|---|---|
| `Transactions.tsx`, `Categories.tsx`, `Accounts.tsx`, `Dashboard.tsx`, `Upload.tsx` | Port + restyle (~85% logic reuse) |
| `models.py` | Schema blueprint (above) |
| `categorization.py`, `recurring_detection.py`, `transfer_detection.py` | Port to TS (~10KB total) |
| `csv/ofx/fidelity/fidelity_position` parsers | Port to TS |
| `pdf_parser.py` | Optional port (pdf-parse) |
| `users.py`, `UserSelector`, `UpdateManager`, `updates.py` | **Skip** — next-auth + no self-updater |
| `budget.db` | One-time import or re-upload source files |

## 7. Security notes

- Plaid `access_token`s in `PlaidItem` table — consider encrypting at rest (AES-GCM w/ env key) since it's the crown jewels.
- All `/api/finance/*` behind existing next-auth session check.

## 8. Locked decisions (2026-09-20)

- Plaid free Trial account: approved. 3 Items: First Citizens, Fidelity, Coinbase.
- Coinbase via Plaid, not direct API.
- Quick links = outbound links to institution portals.
- Full transaction history required → Plaid ~24mo + file-import backfill.
- Analytics only for now; budgets/actions deferred.

## 9. Build order (proposed)

1. Prisma schema + migration, `/finance` shell + nav entry
2. File import pipeline (CSV/OFX/Fidelity) → transactions visible immediately with existing exports
3. Categories + auto-categorization + Transactions tab
4. Overview analytics + grid widget
5. Plaid Link integration (needs your Plaid signup)
6. Snapshots cron + investments/growth charts
7. Recurring detection + Explorer analytics + quick links polish
