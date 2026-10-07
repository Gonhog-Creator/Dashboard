import { scanProgress } from "@/lib/astro/fits";

export const dynamic = "force-dynamic";

/** GET — live FITS scan progress for the library UI's progress bar. */
export async function GET() {
  return Response.json(scanProgress);
}
