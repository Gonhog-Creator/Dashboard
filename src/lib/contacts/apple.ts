/**
 * Minimal iCloud CardDAV client: PROPFIND to discover the addressbook
 * home + collections, then addressbook-query REPORT for vCards.
 * Reuses the same iCloud app-specific password as CalDAV
 * (CALDAV_USERNAME + CALDAV_APP_PASSWORD) against contacts.icloud.com.
 */

const CARDDAV_URL = "https://contacts.icloud.com";
const USER = process.env.CALDAV_USERNAME;
const PASS = process.env.CALDAV_APP_PASSWORD;

export const carddavConfigured = Boolean(USER && PASS);

export class CardDavError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardDavError";
  }
}

function authHeader() {
  return "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
}

async function carddavRequest(
  method: string,
  url: string,
  body: string,
  depth = "1"
): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: depth,
    },
    body,
  });
  if (res.status === 401)
    throw new CardDavError(
      "iCloud rejected the credentials — check CALDAV_USERNAME / CALDAV_APP_PASSWORD"
    );
  if (!res.ok)
    throw new CardDavError(`CardDAV ${method} ${url} → ${res.status}`);
  return res.text();
}

function hrefs(xml: string): string[] {
  return [...xml.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi)].map(
    (m) => m[1]
  );
}

/** Resolve hrefs against the host that served them — iCloud redirects
 * discovery to a partitioned host (pNN-contacts.icloud.com). */
function absolutize(href: string, base: string): string {
  if (href.startsWith("http")) return href;
  return `${new URL(base).origin}${href}`;
}

/** Find the addressbook-home-set URL for the principal. */
async function addressbookHome(): Promise<string> {
  // Step 1: current-user-principal on the server root.
  const principalBody = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal /></d:prop>
</d:propfind>`;
  const principalXml = await carddavRequest(
    "PROPFIND",
    `${CARDDAV_URL}/`,
    principalBody,
    "0"
  );
  const principal = hrefs(principalXml).find((h) => /principal/.test(h));
  if (!principal) throw new CardDavError("could not discover CardDAV principal");

  // Step 2: addressbook-home-set on the principal.
  const homeBody = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop><card:addressbook-home-set /></d:prop>
</d:propfind>`;
  const principalUrl = absolutize(principal, CARDDAV_URL);
  const homeXml = await carddavRequest(
    "PROPFIND",
    principalUrl,
    homeBody,
    "0"
  );
  const home = hrefs(homeXml).find((h) => h !== principal);
  if (!home) throw new CardDavError("could not discover addressbook home");
  return absolutize(home, principalUrl);
}

/** List addressbook collection URLs under the home set. */
async function addressbookCollections(home: string): Promise<string[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:resourcetype />
    <d:displayname />
  </d:prop>
</d:propfind>`;
  const xml = await carddavRequest("PROPFIND", home, body, "1");
  // Each <response> whose resourcetype contains <addressbook .../> is a
  // collection. iCloud emits it with a xmlns attribute, so match loosely.
  const collections: string[] = [];
  for (const m of xml.matchAll(/<[^>]*response[^>]*>([\s\S]*?)<\/[^>]*response>/gi)) {
    const block = m[1];
    if (!/<[^>]*:?addressbook[\s/>]/i.test(block)) continue;
    const href = hrefs(block)[0];
    if (href) collections.push(absolutize(href, home));
  }
  return collections;
}

export interface AppleContact {
  uid: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  birthday: string | null;
  notes: string | null;
  avatarUrl: string | null;
}

/** Decode XML entities — iCloud embeds vCards with &#13;/&#10; line ends. */
function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Unescape vCard text values (\n \, \; \\). */
function unescapeV(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Get all values of a property (params ignored), e.g. EMAIL;TYPE=HOME:x@y. */
function props(body: string, key: string): string[] {
  const re = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "gim");
  return [...body.matchAll(re)].map((m) => m[1].trim());
}

function prop(body: string, key: string): string | undefined {
  return props(body, key)[0];
}

/** ADR:;;street;city;region;zip;country → "city, country" style string. */
function adrToLocation(adr: string): string | null {
  const parts = unescapeV(adr).split(";").map((p) => p.trim());
  const [, , street, city, region, zip, country] = parts;
  const locality = [city, region, zip].filter(Boolean).join(" ");
  const out = [street, locality, country].filter(Boolean).join(", ");
  return out || null;
}

/** BDAY: 19900514 | 1990-05-14 | --0514 → YYYY-MM-DD or MM-DD. */
function bdayToIso(bday: string): string | null {
  const v = bday.trim();
  let m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^--?(\d{2})-?(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function parseVCard(vcard: string): AppleContact | null {
  const unfolded = vcard.replace(/\r?\n[ \t]/g, "");
  const m = unfolded.match(/BEGIN:VCARD([\s\S]*?)END:VCARD/i);
  if (!m) return null;
  const body = m[1];

  const uid = prop(body, "UID") ?? crypto.randomUUID();
  const name =
    prop(body, "FN") ??
    (() => {
      const n = prop(body, "N");
      if (!n) return null;
      const [last, first, , prefix] = unescapeV(n).split(";");
      return [prefix, first, last].filter(Boolean).join(" ") || null;
    })();
  if (!name) return null;

  const org = prop(body, "ORG");
  const company = org ? unescapeV(org).split(";")[0].trim() || null : null;
  const adr = props(body, "ADR")[0];
  const photoUri = props(body, "PHOTO")
    .map((p) => p.trim())
    .find((p) => /^https?:\/\//i.test(p));

  return {
    uid,
    name: unescapeV(name),
    email: prop(body, "EMAIL") ?? null,
    phone: prop(body, "TEL") ?? null,
    company,
    role: prop(body, "TITLE") ?? prop(body, "ROLE") ?? null,
    location: adr ? adrToLocation(adr) : null,
    birthday: prop(body, "BDAY") ? bdayToIso(prop(body, "BDAY")!) : null,
    notes: prop(body, "NOTE") ? unescapeV(prop(body, "NOTE")!) : null,
    avatarUrl: photoUri ?? null,
  };
}

/** Fetch all iCloud contacts via CardDAV. Throws CardDavError on failure. */
export async function fetchAppleContacts(): Promise<AppleContact[]> {
  if (!carddavConfigured)
    throw new CardDavError(
      "iCloud not configured — set CALDAV_USERNAME + CALDAV_APP_PASSWORD"
    );

  const home = await addressbookHome();
  const collections = await addressbookCollections(home);
  if (collections.length === 0)
    throw new CardDavError("no addressbooks found under the CardDAV home set");

  const query = `<?xml version="1.0" encoding="utf-8"?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <card:address-data />
  </d:prop>
</card:addressbook-query>`;

  const contacts: AppleContact[] = [];
  const seen = new Set<string>();
  for (const url of collections) {
    const xml = await carddavRequest("REPORT", url, query);
    for (const m of xml.matchAll(
      /<[^>]*address-data[^>]*>([\s\S]*?)<\/[^>]*address-data>/gi
    )) {
      const c = parseVCard(decodeXml(m[1]));
      if (c && !seen.has(c.uid)) {
        seen.add(c.uid);
        contacts.push(c);
      }
    }
  }
  return contacts;
}
