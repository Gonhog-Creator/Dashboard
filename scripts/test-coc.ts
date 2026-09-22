/** Debug: test the stored CoC API key directly against the official API. */
import { prisma } from "../src/lib/db";

async function main() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["coc.apiKey", "coc.clanTag", "coc.playerTag"] } },
  });
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  console.log("settings:", {
    apiKey: cfg["coc.apiKey"]
      ? `${cfg["coc.apiKey"].slice(0, 20)}… (${cfg["coc.apiKey"].length} chars)`
      : "MISSING",
    clanTag: cfg["coc.clanTag"] || "MISSING",
    playerTag: cfg["coc.playerTag"] || "MISSING",
  });

  const key = cfg["coc.apiKey"];
  if (!key) {
    console.log("no key stored");
    return;
  }

  const tag = encodeURIComponent(
    (cfg["coc.clanTag"] || "").startsWith("#")
      ? cfg["coc.clanTag"]
      : `#${cfg["coc.clanTag"]}`
  );
  const url = `https://api.clashofclans.com/v1/clans/${tag}`;
  console.log("GET", url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key.trim()}` },
  });
  console.log("status:", res.status);
  const body = await res.text();
  console.log("body:", body.slice(0, 500));
}

main().finally(() => prisma.$disconnect());
