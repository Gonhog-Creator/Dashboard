import { NextRequest } from "next/server";
import { z } from "zod";
import { getProvider, aiConfigured, type ChatMessage } from "@/lib/ai/provider";
import { buildContext } from "@/lib/ai/context";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return Response.json(
      { error: "No AI provider configured — set OPENAI_API_KEY or AI_PROVIDER=ollama" },
      { status: 503 }
    );
  }

  const { messages } = chatSchema.parse(await req.json());
  const system = await buildContext();

  const provider = getProvider();
  const reply = await provider.chat([
    { role: "system", content: system },
    ...(messages as ChatMessage[]),
  ]);

  return Response.json({ reply, provider: provider.name });
}
