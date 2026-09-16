import { ExternalLink, GitPullRequest, Star } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Widget } from "@/components/layout/Widget";
import { ContributionGraph } from "@/components/github/ContributionGraph";
import { getGithubDashboard } from "@/lib/github";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col rounded-md border border-border px-3 py-2">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function GithubPage() {
  const data = await getGithubDashboard();

  if (!data.configured) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">GitHub</h1>
        <p className="text-sm text-muted-foreground">
          Set <code className="font-mono">GITHUB_TOKEN</code> in <code className="font-mono">.env</code> to
          enable this page.
        </p>
      </div>
    );
  }

  const unread = data.notifications.filter((n) => n.unread).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          GitHub{data.user ? ` — ${data.user.login}` : ""}
        </h1>
        <a
          href={data.user?.url ?? "https://github.com"}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink />
          Open GitHub
        </a>
      </div>

      {data.errors.length > 0 && (
        <p className="text-xs text-amber-400">
          Some sections failed: {data.errors.join(" · ")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Contributions (year)" value={data.totalContributions} />
        <Stat label="Current streak" value={`${data.currentStreak}d`} />
        <Stat label="Open PRs" value={data.myPRs.length} />
        <Stat label="Unread notifications" value={unread} />
      </div>

      <Widget title="Contributions">
        <ContributionGraph weeks={data.weeks} />
      </Widget>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Widget title="My open PRs">
          {data.myPRs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open PRs.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.myPRs.map((pr) => (
                <li key={pr.id}>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-accent/50"
                  >
                    <GitPullRequest className="size-3.5 shrink-0 text-emerald-400" />
                    <span className="flex-1 text-sm truncate">{pr.title}</span>
                    {pr.isDraft && (
                      <Badge variant="secondary" className="text-[10px]">draft</Badge>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {pr.repo}#{pr.number}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Review requests">
          {data.reviewRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing awaiting your review.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.reviewRequests.map((pr) => (
                <li key={pr.id}>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-accent/50"
                  >
                    <GitPullRequest className="size-3.5 shrink-0 text-amber-400" />
                    <span className="flex-1 text-sm truncate">{pr.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {pr.repo}#{pr.number}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Assigned issues">
          {data.assignedIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assigned issues.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.assignedIssues.map((i) => (
                <li key={i.id}>
                  <a
                    href={i.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-accent/50"
                  >
                    <span className="flex-1 text-sm truncate">{i.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {i.repo}#{i.number}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Widget title="Recent activity" className="xl:col-span-1">
          {data.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <ul className="flex flex-col">
              {data.activity.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-baseline gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50"
                  >
                    <span className="flex-1 text-sm truncate">
                      {a.text}
                      {a.repo && (
                        <span className="text-muted-foreground"> · {a.repo}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(a.createdAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Notifications">
          {data.notificationsUnsupported ? (
            <p className="text-sm text-muted-foreground">
              Needs a classic PAT with the <code className="font-mono">notifications</code>{" "}
              scope — fine-grained tokens can&apos;t read notifications.
            </p>
          ) : data.notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">All caught up.</p>
          ) : (
            <ul className="flex flex-col">
              {data.notifications.map((n) => (
                <li key={n.id}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-baseline gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50"
                  >
                    <span
                      className={
                        n.unread
                          ? "size-1.5 rounded-full bg-primary shrink-0 self-center"
                          : "size-1.5 shrink-0"
                      }
                    />
                    <span className="flex-1 text-sm truncate">
                      {n.title}
                      <span className="text-muted-foreground"> · {n.repo}</span>
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(n.updatedAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Recently pushed">
          {data.recentRepos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repos found.</p>
          ) : (
            <ul className="flex flex-col">
              {data.recentRepos.map((r) => (
                <li key={r.fullName}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">
                        {r.name}
                        {r.isPrivate && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] px-1">
                            private
                          </Badge>
                        )}
                      </span>
                      {r.description && (
                        <span className="text-xs text-muted-foreground truncate block">
                          {r.description}
                        </span>
                      )}
                    </span>
                    {r.stars > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Star className="size-3" />
                        {r.stars}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(r.pushedAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>
    </div>
  );
}
