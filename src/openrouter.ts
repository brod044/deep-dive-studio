import { CONFIG } from "./config.js";
import type { CompleteOptions, ProviderResult } from "./llm.js";

function authHeaders(): Record<string, string> {
  if (!CONFIG.openrouter.apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }
  return {
    Authorization: `Bearer ${CONFIG.openrouter.apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * One-shot completion via OpenRouter's chat completions API.
 * - Optionally attaches the web search plugin (native engine for Anthropic/
 *   OpenAI/Google models, Exa for the rest — no pause_turn on this path).
 * - Retries transient failures once.
 * - Asks OpenRouter to include exact usage/cost accounting in the response.
 */
export async function complete(opts: CompleteOptions): Promise<ProviderResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: [{ role: "user", content: opts.prompt }],
    usage: { include: true },
  };
  if (opts.webSearch) {
    body.plugins = [{ id: "web", max_results: CONFIG.searchesPerAngle }];
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${CONFIG.openrouter.baseUrl}/chat/completions`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
        error?: { message?: string };
      };
      if (json.error?.message) {
        throw new Error(`OpenRouter: ${json.error.message}`);
      }
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) throw new Error("Empty model response");
      return {
        text,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
          cost: json.usage?.cost,
        },
      };
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

/** Render text to MP3 via OpenRouter's OpenAI-compatible speech endpoint. */
export async function speech(text: string): Promise<Buffer> {
  const res = await fetch(`${CONFIG.openrouter.baseUrl}/audio/speech`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: CONFIG.voice.openrouterModel,
      input: text,
      voice: CONFIG.voice.openrouterVoice,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter TTS ${res.status}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
