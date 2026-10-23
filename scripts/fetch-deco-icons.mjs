// Download icons for new items from clashmetic into public/coc/.
import { writeFileSync } from "node:fs";

const CANDIDATES = {
  clash_contest: [
    "https://www.clashmetic.com/images/decoration/Clash_Contest.webp",
  ],
  sour_elixir_fountain: [
    "https://www.clashmetic.com/images/decoration/Sour_Elixir_Fountain.webp",
  ],
  coin_collector: [
    "https://www.clashmetic.com/images/decoration/Coin_Collector.webp",
  ],
  portal_staff: [
    "https://www.clashmetic.com/images/decoration/Portal_Staff.webp",
  ],
  emerald_hot_streak: [
    "https://www.clashmetic.com/images/decoration/Emerald_Hot_Streak.webp",
  ],
  ultimate_hot_streak: [
    "https://www.clashmetic.com/images/decoration/Ultimate_Hot_Streak.webp",
  ],
  amber_hot_streak: [
    "https://www.clashmetic.com/images/decoration/Amber_Hot_Streak.webp",
  ],
  violet_hot_streak: [
    "https://www.clashmetic.com/images/decoration/Violet_Hot_Streak.webp",
  ],
  curious_stump: [
    "https://www.clashmetic.com/images/obstacle/Curious_Stump.webp",
    "https://www.clashmetic.com/images/obstacles/Curious_Stump.webp",
    "https://www.clashmetic.com/images/decoration/Curious_Stump.webp",
  ],
};

for (const [file, urls] of Object.entries(CANDIDATES)) {
  let ok = false;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 500) continue; // probably a placeholder
        writeFileSync(`public/coc/${file}.webp`, buf);
        console.log("OK", file, buf.length, "bytes <-", u);
        ok = true;
        break;
      }
      console.log(r.status, u);
    } catch (e) {
      console.log("ERR", u, e.message);
    }
  }
  if (!ok) console.log("FAILED", file);
}
