export const dynamic = "force-dynamic";

const LAB_BASE = process.env.ENIGMA_LAB_URL ?? "http://127.0.0.1:5340";

/** Cheap liveness probe for the local Enigma lab dashboard. */
export async function GET() {
  let up = false;
  let status: number | null = null;
  try {
    const res = await fetch(LAB_BASE, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    up = res.ok;
    status = res.status;
  } catch {
    // lab offline
  }
  return Response.json({
    up,
    status,
    url: LAB_BASE,
    checkedAt: new Date().toISOString(),
  });
}
