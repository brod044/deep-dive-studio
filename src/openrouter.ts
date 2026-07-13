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
    // Current OpenRouter server tool: the model can issue multiple searches,
    // with a hard cap across the whole research call.
    body.tools = [
      {
        type: "openrouter:web_search",
        parameters: {
          engine: "auto",
          max_results: Math.min(5, CONFIG.searchesPerAngle),
          max_total_results: CONFIG.searchesPerAngle,
        },
      },
    ];
  }
  if (opts.responseFormat) body.response_format = { type: opts.responseFormat };
  if (opts.reasoningEffort) {
    body.reasoning = { effort: opts.reasoningEffort, exclude: true };
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
        choices?: {
          message?: {
            content?: string | null;
            annotations?: {
              type?: string;
              url_citation?: { url?: string; title?: string };
            }[];
          };
          finish_reason?: string | null;
          error?: { code?: number; message?: string };
        }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
          cost?: number;
        };
        error?: { message?: string };
      };
      if (json.error?.message) {
        throw new Error(`OpenRouter: ${json.error.message}`);
      }
      const choice = json.choices?.[0];
      if (choice?.error?.message) {
        throw new Error(`OpenRouter ${choice.error.code ?? "error"}: ${choice.error.message}`);
      }
      let text = choice?.message?.content?.trim() ?? "";
      if (!text) {
        const finish = choice?.finish_reason ?? "unknown";
        const reasoning = json.usage?.completion_tokens_details?.reasoning_tokens;
        throw new Error(
          `OpenRouter returned no content (finish_reason=${finish}` +
            `${typeof reasoning === "number" ? `, reasoning_tokens=${reasoning}` : ""})`
        );
      }

      const citationUrls = [
        ...new Set(
          (choice?.message?.annotations ?? [])
            .filter((a) => a.type === "url_citation")
            .map((a) => a.url_citation?.url)
            .filter((url): url is string => !!url)
        ),
      ];
      if (opts.webSearch && citationUrls.length === 0) {
        throw new Error("OpenRouter web search returned no citation annotations");
      }
      if (opts.webSearch) text = canonicalizeMarkdownCitations(text);
      return {
        text,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
          reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
          webSources: opts.webSearch ? citationUrls.length : undefined,
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

/** Convert a trailing Markdown source link to the note format prompts require. */
function canonicalizeMarkdownCitations(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line.replace(/\[[^\]]+\]\((https?:\/\/[^)]+)\)\s*$/, "($1)")
    )
    .join("\n");
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
      speed: CONFIG.voice.speed,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter TTS ${res.status}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
