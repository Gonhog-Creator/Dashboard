import { prisma, ensureWal } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Lightweight unseen-news count for the sidebar badge. */
export async function GET() {
  try {
    await ensureWal();
    const count = await prisma.scienceNews.count({ where: { seenAt: null } });
    return Response.json({ count });
  } catch {
    return Response.json({ count: 0 });
  }
}
