"use client";

import { useState } from "react";

/** ClashKing CDN stat icons (assets.clashk.ing). */
export const STAT_ICONS = {
  trophy: "https://assets.clashk.ing/icons/Icon_HV_Trophy.png",
  trophyBest: "https://assets.clashk.ing/icons/Icon_HV_Trophy_Best.png",
  warStar: "https://assets.clashk.ing/icons/Icon_HV_Attack_Star.png",
  attack: "https://assets.clashk.ing/icons/Icon_HV_Attack.png",
  shield: "https://assets.clashk.ing/icons/Icon_HV_Shield.png",
  donationsOut: "https://assets.clashk.ing/icons/Icon_HV_Out.png",
  donationsIn: "https://assets.clashk.ing/icons/Icon_HV_In.png",
  xp: "https://assets.clashk.ing/icons/Icon_HV_XP.png",
  clanWar: "https://assets.clashk.ing/icons/Icon_HV_Clan_War.png",
  legend: "https://assets.clashk.ing/icons/Icon_HV_League_Legend_3.png",
  raidAttack: "https://assets.clashk.ing/icons/Icon_HV_Raid_Attack.png",
  capitalGold: "https://assets.clashk.ing/icons/Icon_CC_Resource_Capital_Gold_small.png",
  capitalTrophy: "https://assets.clashk.ing/icons/Icon_CC_Resource_Capital_Trophy.png",
  gold: "https://assets.clashk.ing/resources/gold.webp",
  elixir: "https://assets.clashk.ing/resources/elixir.webp",
  darkElixir: "https://assets.clashk.ing/resources/dark_elixir.webp",
  gems: "https://assets.clashk.ing/resources/gems.webp",
  shinyOre: "https://assets.clashk.ing/resources/shiny_ore.webp",
  glowyOre: "https://assets.clashk.ing/resources/glowy_ore.webp",
  starryOre: "https://assets.clashk.ing/resources/starry_ore.webp",
  leagueMedals: "https://assets.clashk.ing/resources/league_medals.webp",
  raidMedals: "https://assets.clashk.ing/resources/raid_medals.webp",
} as const;

export type StatIconKey = keyof typeof STAT_ICONS;

/** Small inline game icon; hides itself if the CDN 404s. */
export function StatIcon({
  icon,
  size = 16,
  className = "",
}: {
  icon?: StatIconKey | string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !icon) return null;
  const src = icon in STAT_ICONS ? STAT_ICONS[icon as StatIconKey] : icon;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
