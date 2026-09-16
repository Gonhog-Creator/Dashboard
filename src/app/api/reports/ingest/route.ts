import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, ensureWal } from "@/lib/db";

/**
 * Ingestion endpoint for EXTERNAL automations (e.g. a ChatGPT scheduled task
 * or OpenAI automation generating the space-news report). Authenticated by
 * REPORT_INGEST_KEY bearer token — separate from the login gate so external
 * scripts can POST without a session.
 */
const ingestSchema = z.object({
  type: z.string().min(1).max(50), // 'space-news', 'morning-briefing', ...
  title: z.string().min(1).max(200),
  content: z.string().min(1), // markdown
  model: z.string().optional(),
  generatedAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const key = process.env.REPORT_INGEST_KEY;
  if (!key) {
    return Response.json(
      { error: "REPORT_INGEST_KEY not configured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${key}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = ingestSchema.parse(await req.json());
  await ensureWal();
  const report = await prisma.report.create({
    data: {
      type: body.type,
      title: body.title,
      content: body.content,
      source: "external",
      model: body.model ?? null,
      generatedAt: body.generatedAt ? new Date(body.generatedAt) : new Date(),
    },
  });
  return Response.json(report, { status: 201 });
}
