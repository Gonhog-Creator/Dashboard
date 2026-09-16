import { ExternalLink } from "lucide-react";
import { getSettingOr, SETTING_KEYS } from "@/lib/settings";

interface Link {
  label: string;
  url: string;
}

const DEFAULT_LINKS: Link[] = [
  { label: "Photo-AI", url: "http://localhost:8080" },
  { label: "Immich", url: "http://localhost:2283" },
  { label: "PersonalWebsite", url: "https://localhost:3001" },
  { label: "Google Drive", url: "https://drive.google.com" },
];

export async function QuickLinks() {
  const raw = await getSettingOr(SETTING_KEYS.quickLinks, "");
  let links = DEFAULT_LINKS;
  if (raw) {
    try {
      links = JSON.parse(raw) as Link[];
    } catch {
      // keep defaults
    }
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-sm hover:bg-accent transition-colors"
        >
          <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{l.label}</span>
        </a>
      ))}
    </div>
  );
}
