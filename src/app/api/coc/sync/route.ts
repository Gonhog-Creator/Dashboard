import { syncNow } from "@/lib/coc/overview";
import { snapshotMembers, syncRaids, syncBattleLogs, syncWarLog } from "@/lib/coc/sync";
import { syncMeta } from "@/lib/coc/meta";
import { bustPrefix } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** POST /api/coc/sync?what=poll|snapshot|raids|battlelog|meta|all */
export async function POST(req: Request) {
  const what = new URL(req.url).searchParams.get("what") ?? "poll";
  try {
    let payload: unknown;
    switch (what) {
      case "poll":
        payload = await syncNow();
        break;
      case "snapshot":
        payload = { message: await snapshotMembers() };
        break;
      case "raids":
        payload = { message: await syncRaids() };
        break;
      case "warlog":
        payload = { message: await syncWarLog() };
        break;
      case "battlelog":
        payload = { message: await syncBattleLogs() };
        break;
      case "meta":
        payload = { message: await syncMeta() };
        break;
      case "all": {
        const results = await Promise.allSettled([
          syncNow(),
          snapshotMembers(),
          syncRaids(),
          syncWarLog(),
          syncBattleLogs(),
          syncMeta(),
        ]);
        payload = {
          message: results
            .map((r) => {
              if (r.status === "rejected") return `error: ${r.reason}`;
              const v = r.value;
              return typeof v === "string" ? v : v.message;
            })
            .join(" | "),
        };
        break;
      }
      default:
        return Response.json({ error: `unknown sync target ${what}` }, { status: 400 });
    }
    // Fresh rows are in the DB — drop cached read models (overview 60s,
    // meta 30min, global/warstats 24h) so refetches see the new data.
    bustPrefix("coc:");
    return Response.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
