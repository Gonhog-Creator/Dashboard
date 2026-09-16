import type {
  ContributionDay,
  ContributionWeek,
  GithubActivityItem,
  GithubDashboardData,
  GithubIssue,
  GithubPullRequest,
} from "@/types";

const TOKEN = process.env.GITHUB_TOKEN;
const REST = "https://api.github.com";
const GQL = "https://api.github.com/graphql";

const LEVEL_MAP: Record<string, ContributionDay["level"]> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL → ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message ?? "GraphQL error");
  return json.data as T;
}

const CONTRIBUTIONS_QUERY = `
query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}`;

interface GqlCalendar {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: {
          contributionDays: {
            date: string;
            contributionCount: number;
            contributionLevel: string;
          }[];
        }[];
      };
    };
  } | null;
}

function currentStreak(weeks: ContributionWeek[]): number {
  const days = weeks
    .flatMap((w) => w.days)
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let started = false;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.date > today) continue;
    // Allow the streak to start yesterday if today has no contributions yet
    if (!started && d.date === today && d.count === 0) continue;
    started = true;
    if (d.count === 0) break;
    streak++;
  }
  return streak;
}

interface SearchItem {
  id: number;
  title: string;
  number: number;
  html_url: string;
  created_at: string;
  draft?: boolean;
  repository_url: string;
  pull_request?: unknown;
}

function repoFromUrl(repositoryUrl: string): string {
  return repositoryUrl.replace(/^https:\/\/api\.github\.com\/repos\//, "");
}

function toPr(i: SearchItem): GithubPullRequest {
  return {
    id: i.id,
    title: i.title,
    repo: repoFromUrl(i.repository_url),
    number: i.number,
    url: i.html_url,
    createdAt: i.created_at,
    isDraft: Boolean(i.draft),
  };
}

function toIssue(i: SearchItem): GithubIssue {
  return {
    id: i.id,
    title: i.title,
    repo: repoFromUrl(i.repository_url),
    number: i.number,
    url: i.html_url,
    createdAt: i.created_at,
  };
}

interface GhEvent {
  id: string;
  type: string;
  created_at: string;
  repo?: { name: string };
  payload?: Record<string, unknown>;
}

interface GhEventPayload {
  commits?: unknown[];
  size?: number;
  ref?: string;
  ref_type?: string;
  action?: string;
  pull_request?: { number?: number; title?: string; html_url?: string };
  issue?: { number?: number; title?: string; html_url?: string };
  comment?: { html_url?: string };
  release?: { tag_name?: string; html_url?: string };
}

function describeEvent(e: GhEvent): GithubActivityItem | null {
  const repo = e.repo?.name ?? null;
  const repoUrl = repo ? `https://github.com/${repo}` : "https://github.com";
  const p = (e.payload ?? {}) as GhEventPayload;

  switch (e.type) {
    case "PushEvent": {
      const n = (p.commits as unknown[] | undefined)?.length ?? p.size ?? 0;
      const branch = String(p.ref ?? "").replace("refs/heads/", "");
      return {
        id: e.id,
        text: `Pushed ${n} commit${n === 1 ? "" : "s"} to ${branch}`,
        repo,
        url: repoUrl,
        createdAt: e.created_at,
      };
    }
    case "PullRequestEvent":
      return {
        id: e.id,
        text: `${p.action} PR #${p.pull_request?.number}: ${p.pull_request?.title ?? ""}`,
        repo,
        url: p.pull_request?.html_url ?? repoUrl,
        createdAt: e.created_at,
      };
    case "IssuesEvent":
      return {
        id: e.id,
        text: `${p.action} issue #${p.issue?.number}: ${p.issue?.title ?? ""}`,
        repo,
        url: p.issue?.html_url ?? repoUrl,
        createdAt: e.created_at,
      };
    case "IssueCommentEvent":
      return {
        id: e.id,
        text: `Commented on #${p.issue?.number}: ${p.issue?.title ?? ""}`,
        repo,
        url: p.comment?.html_url ?? repoUrl,
        createdAt: e.created_at,
      };
    case "CreateEvent":
      return {
        id: e.id,
        text: `Created ${p.ref_type}${p.ref ? ` ${p.ref}` : ""}`,
        repo,
        url: repoUrl,
        createdAt: e.created_at,
      };
    case "ReleaseEvent":
      return {
        id: e.id,
        text: `Released ${p.release?.tag_name ?? ""}`,
        repo,
        url: p.release?.html_url ?? repoUrl,
        createdAt: e.created_at,
      };
    case "WatchEvent":
      return { id: e.id, text: "Starred", repo, url: repoUrl, createdAt: e.created_at };
    case "ForkEvent":
      return { id: e.id, text: "Forked", repo, url: repoUrl, createdAt: e.created_at };
    default:
      return null;
  }
}

interface GhNotification {
  id: string;
  unread: boolean;
  updated_at: string;
  subject: { title: string; type: string; url: string | null };
  repository: { full_name: string; html_url: string };
}

function notificationUrl(n: GhNotification): string {
  // subject.url is an API URL — convert to the web URL
  if (!n.subject.url) return n.repository.html_url;
  return n.subject.url
    .replace("https://api.github.com/repos/", "https://github.com/")
    .replace("/pulls/", "/pull/");
}

interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  private: boolean;
  pushed_at: string;
}

export async function getGithubDashboard(): Promise<GithubDashboardData> {
  const data: GithubDashboardData = {
    configured: Boolean(TOKEN),
    user: null,
    totalContributions: 0,
    currentStreak: 0,
    weeks: [],
    myPRs: [],
    reviewRequests: [],
    assignedIssues: [],
    activity: [],
    notifications: [],
    recentRepos: [],
    fetchedAt: new Date().toISOString(),
    errors: [],
  };
  if (!TOKEN) return data;

  // 1. Who am I
  let login: string;
  try {
    const u = await rest<{ login: string; name: string | null; avatar_url: string; html_url: string }>("/user");
    data.user = { login: u.login, name: u.name, avatarUrl: u.avatar_url, url: u.html_url };
    login = u.login;
  } catch (e) {
    data.errors.push(`auth: ${e instanceof Error ? e.message : e}`);
    return data; // nothing else works without a valid token
  }

  // 2. Contribution calendar (GraphQL)
  try {
    const d = await gql<GqlCalendar>(CONTRIBUTIONS_QUERY, { login });
    const cal = d.user?.contributionsCollection.contributionCalendar;
    if (cal) {
      data.totalContributions = cal.totalContributions;
      data.weeks = cal.weeks.map((w) => ({
        days: w.contributionDays.map((day) => ({
          date: day.date,
          count: day.contributionCount,
          level: LEVEL_MAP[day.contributionLevel] ?? 0,
        })),
      }));
      data.currentStreak = currentStreak(data.weeks);
    }
  } catch (e) {
    data.errors.push(`contributions: ${e instanceof Error ? e.message : e}`);
  }

  // 3. PRs + issues via search
  const searches: [string, (i: SearchItem) => void][] = [
    [`is:pr is:open author:${login}`, (i) => data.myPRs.push(toPr(i))],
    [`is:pr is:open review-requested:${login}`, (i) => data.reviewRequests.push(toPr(i))],
    [`is:issue is:open assignee:${login}`, (i) => data.assignedIssues.push(toIssue(i))],
  ];
  for (const [q, collect] of searches) {
    try {
      const r = await rest<{ items: SearchItem[] }>(
        `/search/issues?q=${encodeURIComponent(q)}&per_page=10`
      );
      r.items.forEach(collect);
    } catch (e) {
      data.errors.push(`search "${q}": ${e instanceof Error ? e.message : e}`);
    }
  }

  // 4. Recent activity
  try {
    const events = await rest<GhEvent[]>(`/users/${login}/events?per_page=30`);
    data.activity = events
      .map(describeEvent)
      .filter((x): x is GithubActivityItem => x !== null)
      .slice(0, 12);
  } catch (e) {
    data.errors.push(`activity: ${e instanceof Error ? e.message : e}`);
  }

  // 5. Notifications — fine-grained PATs can't access /notifications (403);
  // only classic PATs with the notifications scope work. Fail soft.
  try {
    const ns = await rest<GhNotification[]>("/notifications?per_page=10");
    data.notifications = ns.map((n) => ({
      id: n.id,
      title: n.subject.title,
      repo: n.repository.full_name,
      type: n.subject.type,
      url: notificationUrl(n),
      updatedAt: n.updated_at,
      unread: n.unread,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("403")) {
      data.notificationsUnsupported = true;
    } else {
      data.errors.push(`notifications: ${msg}`);
    }
  }

  // 6. Recently pushed repos
  try {
    const repos = await rest<GhRepo[]>("/user/repos?sort=pushed&per_page=6&affiliation=owner");
    data.recentRepos = repos.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      isPrivate: r.private,
      pushedAt: r.pushed_at,
    }));
  } catch (e) {
    data.errors.push(`repos: ${e instanceof Error ? e.message : e}`);
  }

  return data;
}
