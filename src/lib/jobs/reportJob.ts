import { prisma } from "@/lib/db";
import { getProvider, aiConfigured } from "@/lib/ai/provider";
import { buildContext } from "@/lib/ai/context";
import { registerJob } from "./scheduler";

const BRIEFING_PROMPT = `Write a concise morning briefing for the user based on the dashboard data in context.
Cover: (1) today's calendar, (2) tasks due today/overdue, (3) tonight's imaging verdict and top suggestion if GO.
Markdown format, short sections, no fluff.`;

registerJob({
  key: "morning-briefing",
  name: "Morning briefing (AI)",
  defaultSchedule: "0 6 * * *",
  handler: async () => {
    if (!aiConfigured()) return "skipped: no AI provider configured";

    const context = await buildContext();
    const provider = getProvider();
    const content = await provider.chat([
      { role: "system", content: context },
      { role: "user", content: BRIEFING_PROMPT },
    ]);

    await prisma.report.create({
      data: {
        type: "morning-briefing",
        title: `Morning briefing — ${new Date().toLocaleDateString()}`,
        content,
        source: "internal",
        model: provider.name,
        generatedAt: new Date(),
      },
    });
    return `briefing generated (${content.length} chars)`;
  },
});
