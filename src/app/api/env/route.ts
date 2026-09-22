import { NextRequest } from "next/server";
import { z } from "zod";
import { readEnvFile, writeEnvFile } from "@/lib/envfile";

/**
 * .env editor API. Secret-looking values are never sent to the client —
 * the UI shows them as "set" placeholders and sends value:null to keep them.
 */

const SECRET_RE = /SECRET|KEY|TOKEN|PASS|PWD|CREDENTIAL/i;

export async function GET() {
  const entries = await readEnvFile();
  return Response.json({
    entries: entries.map((e) => ({
      key: e.key,
      secret: SECRET_RE.test(e.key),
      hasValue: e.value !== "",
      value: SECRET_RE.test(e.key) ? "" : e.value,
    })),
  });
}

const putSchema = z.object({
  entries: z.array(
    z.object({
      key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      /** null = keep the existing value (used for masked secrets). */
      value: z.string().nullable(),
    })
  ),
});

export async function PUT(req: NextRequest) {
  const { entries } = putSchema.parse(await req.json());
  const existing = new Map(
    (await readEnvFile()).map((e) => [e.key, e.value])
  );
  // Map dedupes keys (last wins) and preserves submission order.
  const final = new Map<string, string>();
  for (const e of entries) {
    final.set(
      e.key,
      e.value === null ? (existing.get(e.key) ?? "") : e.value
    );
  }
  await writeEnvFile([...final.entries()].map(([key, value]) => ({ key, value })));
  return Response.json({ ok: true });
}
