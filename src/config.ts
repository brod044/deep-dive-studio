import "dotenv/config";

export type LlmProvider = "anthropic" | "openrouter" | "nanogpt";
export type VoiceProvider = "elevenlabs" | "openrouter" | "nanogpt";

// Blank lines in .env ("KEY=") reach us as empty strings — treat as unset.
function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(env(name));
  return Number.isFinite(value) ? value : fallback;
}

// Per-stage defaults for each provider. OpenRouter uses vendor-prefixed slugs.
const MODEL_DEFAULTS: Record<
  LlmProvider,
  { research: string; factcheck: string; writer: string }
> = {
  anthropic: {
    research: "claude-haiku-4-5-20251001",
    factcheck: "claude-sonnet-4-6",
    writer: "claude-opus-4-8",
  },
  openrouter: {
    research: "anthropic/claude-haiku-4.5",
    factcheck: "anthropic/claude-sonnet-4.6",
    writer: "anthropic/claude-opus-4.8",
  },
  nanogpt: {
    research: "minimax/minimax-m2.7",
    factcheck: "google/gemini-3-flash-preview",
    writer: "anthropic/claude-opus-4.6",
  },
};

function computeProvider(): LlmProvider {
  const forced = env("LLM_PROVIDER");
  if (forced === "anthropic" || forced === "openrouter" || forced === "nanogpt") return forced;
  if (env("OPENROUTER_API_KEY")) return "openrouter";
  if (env("NANOGPT_API_KEY")) return "nanogpt";
  return "anthropic";
}

export function modelDefaults(provider: LlmProvider) {
  return { ...MODEL_DEFAULTS[provider] };
}

function configuredModels(provider: LlmProvider) {
  const defaults = MODEL_DEFAULTS[provider];
  return {
    research: env("RESEARCH_MODEL") ?? defaults.research,
    factcheck: env("FACTCHECK_MODEL") ?? defaults.factcheck,
    writer: env("WRITER_MODEL") ?? defaults.writer,
  };
}

function computeVoiceProvider(llmProvider: LlmProvider): VoiceProvider {
  const forced = env("VOICE_PROVIDER");
  if (forced === "elevenlabs" || forced === "openrouter" || forced === "nanogpt") return forced;
  if (env("ELEVENLABS_API_KEY")) return "elevenlabs";
  if (llmProvider === "nanogpt" && env("NANOGPT_API_KEY")) return "nanogpt";
  if (env("OPENROUTER_API_KEY")) return "openrouter";
  if (env("NANOGPT_API_KEY")) return "nanogpt";
  return "openrouter";
}

export function voiceDefaults(provider: VoiceProvider): { model: string; voice: string } {
  if (provider === "nanogpt") return { model: "gpt-4o-mini-tts", voice: "alloy" };
  if (provider === "elevenlabs") {
    return { model: "eleven_multilingual_v2", voice: "onwK4e9ZLuTAKqWW03F9" };
  }
  return { model: "microsoft/mai-voice-2", voice: "en-US-Harper:MAI-Voice-2" };
}

const provider = computeProvider();
const initialVoiceProvider = computeVoiceProvider(provider);
const initialVoiceDefaults = voiceDefaults(initialVoiceProvider);

export const CONFIG = {
  provider,
  openrouter: {
    apiKey: env("OPENROUTER_API_KEY") ?? "",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  nanogpt: {
    apiKey: env("NANOGPT_API_KEY") ?? "",
    baseUrl: "https://nano-gpt.com/api/v1",
  },
  models: configuredModels(provider),
  // Lightweight commissioning call used to suggest the next four topics.
  recommendModel: env("RECOMMEND_MODEL") ?? MODEL_DEFAULTS[provider].research,
  tokens: {
    research: 5000, // dense, figure-heavy notes need headroom
    factcheck: 5000, // reasoning models need headroom before emitting JSON
    section: 1600, // ~1,200 words ceiling per section
  },
  searchesPerAngle: 10,
  wordsPerMinute: 150,
  voice: {
    provider: initialVoiceProvider,
    model: env("TTS_MODEL") ?? initialVoiceDefaults.model,
    voice: env("TTS_VOICE") ?? initialVoiceDefaults.voice,
    speed: Math.min(2, Math.max(0.5, numberEnv("TTS_SPEED", 0.9))),
    chunkChars: Math.min(3900, Math.max(800, numberEnv("TTS_CHUNK_CHARS", 3000))),
  },
  elevenlabs: {
    apiKey: env("ELEVENLABS_API_KEY") ?? "",
    voiceId: env("ELEVENLABS_VOICE_ID") ?? "onwK4e9ZLuTAKqWW03F9",
    modelId: "eleven_multilingual_v2",
  },
};

/**
 * Re-derive provider, keys, model defaults, and voice routing from the current
 * process.env. Called by the UI server after API keys change at runtime.
 */
export function reconfigure(): void {
  const p = computeProvider();
  CONFIG.provider = p;
  CONFIG.openrouter.apiKey = env("OPENROUTER_API_KEY") ?? "";
  CONFIG.nanogpt.apiKey = env("NANOGPT_API_KEY") ?? "";
  Object.assign(CONFIG.models, configuredModels(p));
  CONFIG.recommendModel = env("RECOMMEND_MODEL") ?? MODEL_DEFAULTS[p].research;
  CONFIG.voice.provider = computeVoiceProvider(p);
  const voice = voiceDefaults(CONFIG.voice.provider);
  CONFIG.voice.model = env("TTS_MODEL") ?? voice.model;
  CONFIG.voice.voice = env("TTS_VOICE") ?? voice.voice;
  CONFIG.voice.speed = Math.min(2, Math.max(0.5, numberEnv("TTS_SPEED", 0.9)));
  CONFIG.voice.chunkChars = Math.min(3900, Math.max(800, numberEnv("TTS_CHUNK_CHARS", 3000)));
  CONFIG.elevenlabs.apiKey = env("ELEVENLABS_API_KEY") ?? "";
}

/** Select a provider for the next server-owned job without rewriting .env. */
export function configureProvider(provider: LlmProvider): void {
  CONFIG.provider = provider;
  Object.assign(CONFIG.models, configuredModels(provider));
  CONFIG.recommendModel = env("RECOMMEND_MODEL") ?? MODEL_DEFAULTS[provider].research;
}
