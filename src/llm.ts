import { CONFIG } from "./config.js";
import { complete as anthropicComplete } from "./anthropic.js";
import { complete as openrouterComplete } from "./openrouter.js";
import { mockComplete } from "./mock.js";
import { emitCall } from "./telemetry.js";

export interface CompleteOptions {
  model: string;
  maxTokens: number;
  prompt: string;
  webSearch?: boolean;
  /** Telemetry label, e.g. "research/history". Stage prefix keys the cost breakdown. */
  label?: string;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
}

/** What provider clients return; llm.complete unwraps to text for the stages. */
export interface ProviderResult {
  text: string;
  usage?: Usage;
}

/** Mutable runtime switches. `mock` = test-flight mode: canned responses, no API spend. */
export const runtime = { mock: false };

/** Provider-agnostic one-shot completion. Stages call this, never a client directly. */
export async function complete(opts: CompleteOptions): Promise<string> {
  const t0 = Date.now();
  const result = runtime.mock
    ? await mockComplete(opts)
    : CONFIG.provider === "openrouter"
      ? await openrouterComplete(opts)
      : await anthropicComplete(opts);
  emitCall({
    at: t0,
    label: opts.label ?? "call",
    provider: runtime.mock ? "mock" : CONFIG.provider,
    model: opts.model,
    ms: Date.now() - t0,
    ...result.usage,
  });
  return result.text;
}
