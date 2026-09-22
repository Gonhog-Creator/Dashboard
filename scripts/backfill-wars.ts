/** Backfill clan war history from ClashKing's open API into CocWar/CocWarAttack.
 *  Only imports regular wars (attacksPerMember !== 1) — CWL is synced separately
 *  via the league group and uses warTag dedupe. Idempotent: reuses captureWar's
 *  (type, startTime, opponentTag) dedupe + per-attack upserts.
 *  Usage: npx tsx scripts/backfill-wars.ts [limit] */
import { prisma, ensureWal } from "../src/lib/db";
import { cocConfig, normalizeTag } from "../src/lib/coc/client";
import { captureWar } from "../src/lib/coc/sync";

const CK = "https://api.clashk.ing";
const LIMIT = Number(process.argv[2] ?? 200);

/** 20260918T142404.000Z → 2026-09-18T14:24:04.000Z */
function cocToIso(t: string): string {
  const m = t.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z?$/
  );
  if (!m) return t;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ".000"}Z`;
}

interface CkWar {
  state: string;
  teamSize: number;
  attacksPerMember: number;
  startTime: string;
  endTime: string;
  clan: { tag: string };
  opponent?: { tag?: string };
}

async function main() {
  await ensureWal();
  const cfg = await cocConfig();
  const clanTag = normalizeTag(cfg.clanTag).replace(/^#/, "");

  // CK's /wars defaults to regular wars; ?type=cwl returns league wars.
  for (const [typeParam, warType] of [
    ["", "regular"],
    ["cwl", "cwl"],
  ] as const) {
    let before: string | null = null;
    let imported = 0;
    let pages = 0;

    for (;;) {
      const url =
        `${CK}/v2/clan/${clanTag}/wars?limit=${LIMIT}` +
        (typeParam ? `&type=${typeParam}` : "") +
        (before ? `&time[before]=${encodeURIComponent(before)}` : "");
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`ClashKing ${res.status}: ${await res.text()}`);
      const { items } = (await res.json()) as { items: CkWar[] };
      if (!items?.length) break;
      pages++;

      for (const w of items) {
        // Safety: a stray 1-attack war in the regular feed is CWL — skip it.
        if (warType === "regular" && w.attacksPerMember === 1) continue;
        // CWL season = YYYY-MM of the war start.
        const season =
          warType === "cwl" && w.startTime
            ? `${w.startTime.slice(0, 4)}-${w.startTime.slice(4, 6)}`
            : null;
        await captureWar(w as never, warType, season, null);
        imported++;
      }

      // Oldest war's startTime becomes the next page's upper bound.
      const oldest = items[items.length - 1].startTime;
      if (items.length < LIMIT || !oldest) break;
      before = cocToIso(oldest);
    }

    console.log(`  ${warType}: ${imported} wars across ${pages} page(s)`);
  }

  const counts = await prisma.cocWar.groupBy({
    by: ["type"],
    _count: true,
  });
  console.log("backfill done —", JSON.stringify(counts));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
