import { exchangePublicToken, savePlaidItem, syncItem } from "@/lib/finance/plaid";

export const dynamic = "force-dynamic";

/** POST { publicToken } — exchange, persist item+accounts, run first sync. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const publicToken = body?.publicToken;
  if (!publicToken) {
    return Response.json({ error: "publicToken required" }, { status: 400 });
  }
  try {
    const { access_token, item_id } = await exchangePublicToken(publicToken);
    const saved = await savePlaidItem(item_id, access_token);
    // First sync in-band so the UI can report real counts.
    const syncMsg = await syncItem(item_id).catch((e) => `sync deferred: ${e.message}`);
    return Response.json({ ok: true, ...saved, sync: syncMsg });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}
