import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const LAB_BASE = process.env.ENIGMA_LAB_URL ?? "http://127.0.0.1:5340";
const PROXY_PREFIX = "/api/enigma";

// Headers that must not be forwarded verbatim between hops.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "content-encoding",
  "content-length",
  "host",
]);

function labUrl(req: NextRequest, path: string[] | undefined): string {
  const target = path?.length ? `/${path.join("/")}` : "/";
  return `${LAB_BASE}${target}${req.nextUrl.search}`;
}

/**
 * The Enigma lab UI (FastAPI on 127.0.0.1:5340) is unreachable from Tailscale
 * clients, so the dashboard embeds it through this proxy. Absolute paths in the
 * lab's HTML (src="/app.js") would hit the dashboard origin, so rewrite them to
 * stay under the proxy prefix.
 */
function rewriteHtml(html: string): string {
  return html
    .replace(
      /(\s(?:href|src|action)\s*=\s*["'])\/(?!\/)/g,
      `$1${PROXY_PREFIX}/`
    )
    .replace(
      /(<base\s[^>]*href\s*=\s*["'])\/(?!\/)/g,
      `$1${PROXY_PREFIX}/`
    );
}

async function proxy(req: NextRequest, path: string[] | undefined) {
  const url = labUrl(req, path);

  const headers = new Headers();
  for (const [k, v] of req.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // Required by undici when passing a stream body.
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
      cache: "no-store",
    } as RequestInit);
  } catch {
    return new Response("Enigma lab is not reachable on " + LAB_BASE, {
      status: 502,
    });
  }

  const outHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders.set(k, v);
  }
  // Keep the embed inside the dashboard iframe working even if the lab sends
  // a restrictive frame header.
  outHeaders.delete("x-frame-options");
  outHeaders.delete("content-security-policy");

  // Rewrite relative redirects so they stay under the proxy prefix.
  const location = upstream.headers.get("location");
  if (location?.startsWith("/") && !location.startsWith(PROXY_PREFIX)) {
    outHeaders.set("location", `${PROXY_PREFIX}${location}`);
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") && upstream.body) {
    const html = await upstream.text();
    return new Response(rewriteHtml(html), {
      status: upstream.status,
      headers: outHeaders,
    });
  }

  // Stream everything else (SSE events, assets) without buffering.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function HEAD(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
