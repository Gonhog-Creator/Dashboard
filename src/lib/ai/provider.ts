/**
 * AI provider interface. OpenAI first; Ollama swaps in via AI_PROVIDER=ollama
 * without touching call sites.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
  complete(prompt: string): Promise<string>;
}

class OpenAIProvider implements AIProvider {
  name = "openai";
  private model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  async chat(messages: ChatMessage[]): Promise<string> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not configured");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, messages }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  async complete(prompt: string): Promise<string> {
    return this.chat([{ role: "user", content: prompt }]);
  }
}

class OllamaProvider implements AIProvider {
  name = "ollama";
  private base = process.env.OLLAMA_URL ?? "http://localhost:11434";
  private model = process.env.OLLAMA_MODEL ?? "llama3.1";

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.message?.content ?? "";
  }

  async complete(prompt: string): Promise<string> {
    return this.chat([{ role: "user", content: prompt }]);
  }
}

export function aiConfigured(): boolean {
  const provider = process.env.AI_PROVIDER ?? "openai";
  if (provider === "ollama") return true; // no key needed
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "openai";
  return provider === "ollama" ? new OllamaProvider() : new OpenAIProvider();
}
