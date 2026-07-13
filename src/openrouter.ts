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
  let promptTokens = 0;
  let completionTokens = 0;
  let reasoningTokens = 0;
  let cost = 0;
  const allCitationUrls = new Set<string>();
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
            url_citation?: {
              url?: string;
              title?: string;
              content?: string;
              start_index?: number;
              end_index?: number;
            };
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
      promptTokens += json.usage?.prompt_tokens ?? 0;
      completionTokens += json.usage?.completion_tokens ?? 0;
      reasoningTokens += json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      cost += json.usage?.cost ?? 0;

      const citationUrls = [
        ...new Set(
          (choice?.message?.annotations ?? [])
            .filter((a) => a.type === "url_citation")
            .map((a) => a.url_citation?.url)
            .filter((url): url is string => !!url)
        ),
      ];
      for (const url of citationUrls) allCitationUrls.add(url);

      let text = choice?.message?.content?.trim() ?? "";
      if (!text) {
        const finish = choice?.finish_reason ?? "unknown";
        const reasoning = json.usage?.completion_tokens_details?.reasoning_tokens;
        if (opts.webSearch && finish === "tool_calls" && attempt === 0) {
          // Some gateway models expose the server search request as an
          // unfinished client tool call. Fall back to injected web context,
          // which requires no client-side tool execution.
          delete body.tools;
          body.plugins = [
            {
              id: "web",
              engine: "auto",
              max_results: CONFIG.searchesPerAngle,
            },
          ];
          lastErr = new Error("OpenRouter web search requested client continuation");
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw new Error(
          `OpenRouter returned no content (finish_reason=${finish}` +
            `${typeof reasoning === "number" ? `, reasoning_tokens=${reasoning}` : ""})`
        );
      }

      if (opts.webSearch && citationUrls.length === 0) {
        throw new Error("OpenRouter web search returned no citation annotations");
      }
      if (opts.webSearch) {
        text = canonicalizeMarkdownCitations(text, choice?.message?.annotations ?? []);
      }
      return {
        text,
        usage: {
          promptTokens: promptTokens || undefined,
          completionTokens: completionTokens || undefined,
          reasoningTokens: reasoningTokens || undefined,
          webSources: opts.webSearch ? allCitationUrls.size : undefined,
          cost: cost || undefined,
        },
      };
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

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

/**
 * Normalize list markers and attach OpenRouter's indexed URL annotations to
 * the exact lines they support. Some models cite correctly in annotations but
 * omit the literal URLs from their visible text.
 */
export function canonicalizeMarkdownCitations(
  text: string,
  annotations: UrlCitationAnnotation[]
): string {
  const citations = annotations
    .filter((annotation) => annotation.type === "url_citation")
    .map((annotation) => annotation.url_citation)
    .filter((citation): citation is NonNullable<typeof citation> => !!citation?.url);

  let offset = 0;
  return text
    .split("\n")
    .map((originalLine) => {
      const lineStart = offset;
      const lineEnd = lineStart + originalLine.length;
      offset = lineEnd + 1;

      let line = originalLine
        .replace(/^\s*(?:[*•▪◦]|\d+[.)])\s+/, "- ")
        .replace(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)\s*$/, "($1)")
        .replace(/<((?:https?):\/\/[^>\s]+)>\s*$/, "($1)")
        .replace(/\s+(?:Source:\s*)?(https?:\/\/[^\s)]+)\s*$/i, " ($1)");

      if (!line.trim().startsWith("-") || /\(https?:\/\/[^\s)]+\)\s*$/.test(line.trim())) {
        return line;
      }

      const citation = citations.find((candidate) => {
        const start = candidate.start_index;
        const end = candidate.end_index;
        return (
          typeof start === "number" &&
          typeof end === "number" &&
          start <= lineEnd &&
          end >= lineStart
        );
      });
      if (citation?.url) line = `${line.trimEnd()} (${citation.url})`;
      return line;
    })
    .join("\n");
}

/** Render text to MP3 via OpenRouter's OpenAI-compatible speech endpoint. */
export async function speech(text: string): Promise<Buffer> {
  const res = await fetch(`${CONFIG.openrouter.baseUrl}/audio/speech`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: CONFIG.voice.model,
      input: text,
      voice: CONFIG.voice.voice,
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
