import { createLinkToken, plaidConfigured } from "@/lib/finance/plaid";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!plaidConfigured()) {
    return Response.json(
      { error: "Plaid not configured — set PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV" },
      { status: 400 }
    );
  }
  try {
    const linkToken = await createLinkToken();
    return Response.json({ linkToken });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}
