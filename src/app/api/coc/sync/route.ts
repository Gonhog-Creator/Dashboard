import { syncNow } from "@/lib/coc/overview";
import { snapshotMembers, syncRaids, syncBattleLogs, syncWarLog } from "@/lib/coc/sync";
import { syncMeta } from "@/lib/coc/meta";

export const dynamic = "force-dynamic";

/** POST /api/coc/sync?what=poll|snapshot|raids|battlelog|meta|all */
export async function POST(req: Request) {
  const what = new URL(req.url).searchParams.get("what") ?? "poll";
  try {
    switch (what) {
      case "poll":
        return Response.json(await syncNow());
      case "snapshot":
        return Response.json({ message: await snapshotMembers() });
      case "raids":
        return Response.json({ message: await syncRaids() });
      case "warlog":
        return Response.json({ message: await syncWarLog() });
      case "battlelog":
        return Response.json({ message: await syncBattleLogs() });
      case "meta":
        return Response.json({ message: await syncMeta() });
      case "all": {
        const results = await Promise.allSettled([
          syncNow(),
          snapshotMembers(),
          syncRaids(),
          syncWarLog(),
          syncBattleLogs(),
          syncMeta(),
        ]);
        return Response.json({
          message: results
            .map((r) => {
              if (r.status === "rejected") return `error: ${r.reason}`;
              const v = r.value;
              return typeof v === "string" ? v : v.message;
            })
            .join(" | "),
        });
      }
      default:
        return Response.json({ error: `unknown sync target ${what}` }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
