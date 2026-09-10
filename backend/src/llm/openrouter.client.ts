import axios from "axios";
import { env } from "../env";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

// Asks the model about an image (used to read a garment's colour off its
// product photo when the store publishes no colour at all). Same JSON
// contract and failure behaviour as completeJson.
export async function completeJsonAboutImage<T>(
  instruction: string,
  imageUrl: string,
  timeoutMs = 25000
): Promise<T | null> {
  return request<T>(
    [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    timeoutMs
  );
}

// Minimal OpenRouter (https://openrouter.ai) chat-completions client.
// Requests strict JSON back via response_format -- every caller in this
// project asks the model for a small structured object.
export async function completeJson<T>(messages: ChatMessage[], timeoutMs = 20000): Promise<T | null> {
  return request<T>(messages, timeoutMs);
}

async function request<T>(messages: unknown[], timeoutMs: number): Promise<T | null> {
  if (!env.llmEnabled) return null;

  try {
    const { data } = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: env.openRouterModel,
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
        // The replies we ask for are a tiny JSON object (a product id +
        // one-sentence reason). Without a cap, some models default to
        // their full max output (tens of thousands of tokens), which
        // OpenRouter then reserves budget for up front -- that alone can
        // trip a 402 "insufficient credits" on a low account balance even
        // though the actual reply is a few dozen tokens.
        max_tokens: 300,
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
    const detail = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message) : (err as Error).message;
    console.warn("[openrouter] request failed:", detail);
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
