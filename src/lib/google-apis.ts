import { google } from "googleapis";
import { auth, authEnabled } from "@/lib/auth";

/**
 * Google API helpers for the People tab — Drive file search (meeting notes)
 * and Contacts import. Both need the scopes added in auth.ts; if the user
 * hasn't re-consented yet these return empty results / throw a clear error.
 */

async function oauth2Client() {
  if (!authEnabled) return null;
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) return null;
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return client;
}

export class GoogleScopeError extends Error {
  constructor(api: string) {
    super(`google-${api}-unauthorized`);
    this.name = "GoogleScopeError";
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  modifiedAt: string | null;
}

/** Search Drive files by name/full-text. Returns [] when not authed. */
export async function searchDriveFiles(q: string): Promise<DriveFile[]> {
  const client = await oauth2Client();
  if (!client) return [];
  const drive = google.drive({ version: "v3", auth: client });
  try {
    const res = await drive.files.list({
      q: `name contains '${q.replace(/'/g, "\\'")}' and trashed = false`,
      fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
      pageSize: 20,
      orderBy: "modifiedTime desc",
    });
    return (res.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name ?? "(untitled)",
      mimeType: f.mimeType ?? "",
      url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
      modifiedAt: f.modifiedTime ?? null,
    }));
  } catch (e) {
    const status = (e as { status?: number; code?: number }).status ??
      (e as { code?: number }).code;
    if (status === 401 || status === 403) throw new GoogleScopeError("drive");
    throw e;
  }
}

export interface GoogleContact {
  resourceName: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  avatarUrl: string | null;
}

/** Fetch all Google Contacts via the People API. */
export async function fetchGoogleContacts(): Promise<GoogleContact[]> {
  const client = await oauth2Client();
  if (!client) return [];
  const people = google.people({ version: "v1", auth: client });
  const out: GoogleContact[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const res = await people.people.connections.list({
        resourceName: "people/me",
        personFields: "names,emailAddresses,phoneNumbers,organizations,photos",
        pageSize: 200,
        pageToken,
      });
      for (const c of res.data.connections ?? []) {
        const name =
          c.names?.find((n) => n.metadata?.primary)?.displayName ??
          c.names?.[0]?.displayName;
        if (!name) continue;
        const org = c.organizations?.find((o) => o.metadata?.primary) ??
          c.organizations?.[0];
        out.push({
          resourceName: c.resourceName!,
          name,
          email:
            c.emailAddresses?.find((e) => e.metadata?.primary)?.value ??
            c.emailAddresses?.[0]?.value ??
            null,
          phone:
            c.phoneNumbers?.find((p) => p.metadata?.primary)?.value ??
            c.phoneNumbers?.[0]?.value ??
            null,
          company: org?.name ?? null,
          role: org?.title ?? null,
          avatarUrl:
            c.photos?.find((p) => p.metadata?.primary && !p.default)?.url ??
            null,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (e) {
    const err = e as { status?: number; code?: number; message?: string };
    const status = err.status ?? err.code;
    if (status === 401 || status === 403) {
      // 403 can mean missing scope OR the People API isn't enabled on the
      // GCP project — surface the real message so the user can tell which.
      const msg = err.message ?? "";
      if (/has not been used|is disabled|accessNotConfigured/i.test(msg))
        throw new Error(
          "People API not enabled — enable it at console.cloud.google.com/apis/library/people.googleapis.com"
        );
      throw new GoogleScopeError("contacts");
    }
    throw e;
  }
  return out;
}
