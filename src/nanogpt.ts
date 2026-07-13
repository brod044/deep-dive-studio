import { CONFIG } from "./config.js";
import { canonicalizeMarkdownCitations } from "./openrouter.js";
import type { CompleteOptions, ProviderResult } from "./llm.js";

type UrlCitationAnnotation = {
  type?: string;
  url_citation?: {
    url?: string;
    title?: string;
    content?: string;
    start_index?: number;
    end_index?: number;
  };
};

function authHeaders(): Record<string, string> {
  if (!CONFIG.nanogpt.apiKey) throw new Error("NANOGPT_API_KEY is not set.");
  return {
    Authorization: `Bearer ${CONFIG.nanogpt.apiKey}`,
    "Content-Type": "application/json",
  };
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

function visibleText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("")
    .trim();
}

/** OpenAI-compatible text completion with NanoGPT-hosted web enrichment. */
export async function complete(opts: CompleteOptions): Promise<ProviderResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    stream: false,
    messages: [{ role: "user", content: opts.prompt }],
    reasoning: { exclude: true },
  };
  if (opts.webSearch) {
    body.webSearch = {
      enabled: true,
      provider: "exa",
      depth: "neural",
      numResults: CONFIG.searchesPerAngle,
    };
  }
  if (opts.responseFormat) body.response_format = { type: opts.responseFormat };
  if (opts.reasoningEffort && opts.reasoningEffort !== "none") {
    body.reasoning_effort = opts.reasoningEffort;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${CONFIG.nanogpt.baseUrl}/chat/completions`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`NanoGPT ${res.status}: ${detail.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{
          message?: { content?: unknown; annotations?: UrlCitationAnnotation[] };
          finish_reason?: string | null;
          error?: unknown;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          reasoning_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
          cost?: number;
        };
        error?: unknown;
        message?: string;
      };
      const topError = errorMessage(json.error) ?? json.message;
      if (topError) throw new Error(`NanoGPT: ${topError}`);
      const choice = json.choices?.[0];
      const choiceError = errorMessage(choice?.error);
      if (choiceError) throw new Error(`NanoGPT: ${choiceError}`);

      let text = visibleText(choice?.message?.content);
      if (!text) {
        throw new Error(`NanoGPT returned no content (finish_reason=${choice?.finish_reason ?? "unknown"})`);
      }
      const annotations = choice?.message?.annotations ?? [];
      if (opts.webSearch && annotations.length) {
        text = canonicalizeMarkdownCitations(text, annotations);
      }
      const urls = new Set(text.match(/https?:\/\/[^\s)>\]]+/g) ?? []);
      if (opts.webSearch && urls.size === 0) {
        throw new Error("NanoGPT web search returned no visible source URLs");
      }
      const reasoningTokens =
        json.usage?.completion_tokens_details?.reasoning_tokens ?? json.usage?.reasoning_tokens;
      return {
        text,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
          reasoningTokens,
          webSources: opts.webSearch ? urls.size : undefined,
          cost: json.usage?.cost,
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

/** Render one buffered MP3 chunk through NanoGPT's compatible speech API. */
export async function speech(text: string): Promise<Buffer> {
  const res = await fetch(`${CONFIG.nanogpt.baseUrl}/audio/speech`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: CONFIG.voice.model,
      input: text,
      voice: CONFIG.voice.voice,
      response_format: "mp3",
      speed: CONFIG.voice.speed,
      stream: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`NanoGPT TTS ${res.status}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
