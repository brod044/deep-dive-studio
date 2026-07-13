import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "./config.js";
import type { CompleteOptions, ProviderResult } from "./llm.js";

// Lazy: constructing the client throws without ANTHROPIC_API_KEY, and this
// module is imported even when the run goes through OpenRouter.
let _client: Anthropic | undefined;
function client(): Anthropic {
  return (_client ??= new Anthropic()); // reads ANTHROPIC_API_KEY
}

/** Drop the cached client so a runtime key change takes effect. */
export function resetClient(): void {
  _client = undefined;
}

/**
 * One-shot completion helper.
 * - Optionally attaches the server-side web_search tool.
 * - Handles `pause_turn` continuation (long web-search turns are split by the
 *   API; we must feed the partial assistant turn back to continue).
 * - Retries transient failures once.
 * - Reports token usage (summed across pause_turn hops); cost is left unset —
 *   the direct API bills the account, it doesn't price individual calls.
 */
export async function complete(opts: CompleteOptions): Promise<ProviderResult> {
  const tools = opts.webSearch
    ? ([
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: CONFIG.searchesPerAngle,
        },
      ] as any)
    : undefined;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: opts.prompt },
      ];
      let promptTokens = 0;
      let completionTokens = 0;
      let response = await client().messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        messages,
        ...(tools ? { tools } : {}),
      });
      promptTokens += response.usage.input_tokens;
      completionTokens += response.usage.output_tokens;

      // Continue paused turns (common with multi-search requests).
      let hops = 0;
      while (response.stop_reason === "pause_turn" && hops < 5) {
        messages.push({ role: "assistant", content: response.content as any });
        response = await client().messages.create({
          model: opts.model,
          max_tokens: opts.maxTokens,
          messages,
          ...(tools ? { tools } : {}),
        });
        promptTokens += response.usage.input_tokens;
        completionTokens += response.usage.output_tokens;
        hops++;
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("Empty model response");
      return { text, usage: { promptTokens, completionTokens } };
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}
