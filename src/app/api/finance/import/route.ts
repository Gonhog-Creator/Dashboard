import { importStatement } from "@/lib/finance/import";

export const dynamic = "force-dynamic";

/** POST multipart form: file + optional accountId. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const accountId = form.get("accountId");
    if (!(file instanceof File)) {
      return Response.json({ error: "file required" }, { status: 400 });
    }
    const content = Buffer.from(await file.arrayBuffer());
    const result = await importStatement(
      file.name,
      content,
      typeof accountId === "string" && accountId ? accountId : undefined
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 422 });
  }
}
