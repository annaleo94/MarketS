import axios from "axios";
import { env } from "../env";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

// Minimal OpenRouter (https://openrouter.ai) chat-completions client.
// Requests strict JSON back via response_format -- every caller in this
// project asks the model for a small structured object.
export async function completeJson<T>(messages: ChatMessage[], timeoutMs = 20000): Promise<T | null> {
  if (!env.llmEnabled) return null;

  try {
    const { data } = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: env.openRouterModel,
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${env.openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/annaleo94/MarketS",
          "X-Title": "MarketS",
        },
        timeout: timeoutMs,
      }
    );

    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return parseJsonLoosely<T>(content);
  } catch (err) {
    console.warn("[openrouter] request failed:", (err as Error).message);
    return null;
  }
}

// Models occasionally wrap JSON in prose or a ```json fence despite
// response_format -- this recovers from that instead of failing the whole
// match.
function parseJsonLoosely<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
