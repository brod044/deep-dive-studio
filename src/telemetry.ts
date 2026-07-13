/**
 * Tiny synchronous event bus for LLM/TTS call accounting. `llm.ts` and
 * `voice.ts` emit one event per upstream call; the pipeline collects them
 * into the episode's meta.json, and the UI server relays them live over SSE.
 */
export interface CallEvent {
  at: number; // epoch ms, call start
  label: string; // "research/history", "factcheck", "write/cold-open", "voice/origins", "recommend"
  provider: string; // "anthropic" | "openrouter" | "elevenlabs" | "mock"
  model: string;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number; // USD; exact on OpenRouter, absent where unknown
  chars?: number; // TTS input size
}

type Listener = (e: CallEvent) => void;
const listeners = new Set<Listener>();

export function onCall(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitCall(e: CallEvent): void {
  for (const fn of listeners) fn(e);
}
