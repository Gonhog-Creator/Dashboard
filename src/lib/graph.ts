import { getSetting, setSetting } from "@/lib/settings";

/**
 * Microsoft Graph auth for To Do — device-code flow against the `common`
 * tenant so personal Microsoft accounts work. No client secret required;
 * the app registration must enable "Allow public client flows".
 *
 * The refresh token lives in the Setting table (msft.refreshToken) so cron
 * jobs and API routes can call Graph without a browser session.
 */

const TENANT = process.env.MSFT_TENANT ?? "common";
const CLIENT_ID = process.env.MSFT_CLIENT_ID ?? "";
const SCOPE = "Tasks.ReadWrite offline_access";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const REFRESH_KEY = "msft.refreshToken";

export function msftConfigured() {
  return Boolean(CLIENT_ID);
}

export async function msftConnected() {
  return Boolean(await getSetting(REFRESH_KEY));
}

// --- device code flow ---

export interface DeviceCodeSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export async function startDeviceCode(): Promise<DeviceCodeSession> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE }),
    }
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data.error_description ?? data.error ?? "device code request failed"
    );
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval ?? 5,
  };
}

export type PollResult = "pending" | "connected" | "expired" | "error";

/** One poll attempt — the client repeats this on the session's interval. */
export async function pollDeviceCode(deviceCode: string): Promise<PollResult> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      }),
    }
  );
  const data = await res.json();
  if (res.ok) {
    await setSetting(REFRESH_KEY, data.refresh_token);
    cacheToken(data.access_token, data.expires_in);
    return "connected";
  }
  if (data.error === "authorization_pending") return "pending";
  if (
    data.error === "expired_token" ||
    data.error === "authorization_declined" ||
    data.error === "bad_verification_code"
  )
    return "expired";
  console.error("[msft] device code poll failed", data);
  return "error";
}

export async function disconnectMsft() {
  await setSetting(REFRESH_KEY, "");
  cached = null;
}

// --- access token ---

let cached: { token: string; expiresAt: number } | null = null;

function cacheToken(token: string, expiresIn: number) {
  cached = { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
}

export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const refresh = await getSetting(REFRESH_KEY);
  if (!refresh) throw new Error("msft-not-connected");
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refresh,
        scope: SCOPE,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    // Revoked/expired refresh token — drop it so status flips to disconnected.
    if (data.error === "invalid_grant") await setSetting(REFRESH_KEY, "");
    throw new Error(
      data.error_description ?? data.error ?? "token refresh failed"
    );
  }
  // Microsoft rotates refresh tokens — always persist the newest one.
  if (data.refresh_token) await setSetting(REFRESH_KEY, data.refresh_token);
  cacheToken(data.access_token, data.expires_in);
  return data.access_token;
}

// --- Graph fetch helpers ---

export async function graphFetch(
  path: string,
  init: RequestInit = {},
  retries = 4
): Promise<Response> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  // Graph throttles bursts — honor Retry-After and back off.
  if (res.status === 429 && retries > 0) {
    const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise((r) => setTimeout(r, Math.min(wait, 15) * 1000));
    return graphFetch(path, init, retries - 1);
  }
  return res;
}

export async function graphJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await graphFetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}
