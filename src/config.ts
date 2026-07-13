import "dotenv/config";

export type LlmProvider = "anthropic" | "openrouter";
export type VoiceProvider = "elevenlabs" | "openrouter";

// Blank lines in .env ("KEY=") reach us as empty strings — treat as unset.
function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
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
};

function computeProvider(): LlmProvider {
  // OpenRouter wins when both keys are present; force with LLM_PROVIDER.
  return (
    (env("LLM_PROVIDER") as LlmProvider | undefined) ??
    (env("OPENROUTER_API_KEY") ? "openrouter" : "anthropic")
  );
}

const provider = computeProvider();

export const CONFIG = {
  provider,
  openrouter: {
    apiKey: env("OPENROUTER_API_KEY") ?? "",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  models: {
    // Cheap + fast agentic researcher. Runs 5x in parallel with web search.
    research: env("RESEARCH_MODEL") ?? MODEL_DEFAULTS[provider].research,
    // Mid-tier verifier: cross-references the research files.
    factcheck: env("FACTCHECK_MODEL") ?? MODEL_DEFAULTS[provider].factcheck,
    // Best available writer for the narration itself.
    writer: env("WRITER_MODEL") ?? MODEL_DEFAULTS[provider].writer,
  },
  tokens: {
    research: 5000, // dense, figure-heavy notes need headroom
    factcheck: 2000,
    section: 1600, // ~1,200 words ceiling per section
  },
  searchesPerAngle: 10,
  wordsPerMinute: 150,
  voice: {
    // ElevenLabs if its key is set, else OpenRouter TTS; force with VOICE_PROVIDER.
    provider: (env("VOICE_PROVIDER") ??
      (env("ELEVENLABS_API_KEY") ? "elevenlabs" : "openrouter")) as VoiceProvider,
    openrouterModel: env("TTS_MODEL") ?? "openai/gpt-4o-mini-tts-2025-12-15",
    openrouterVoice: env("TTS_VOICE") ?? "onyx",
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
  CONFIG.models.research = env("RESEARCH_MODEL") ?? MODEL_DEFAULTS[p].research;
  CONFIG.models.factcheck = env("FACTCHECK_MODEL") ?? MODEL_DEFAULTS[p].factcheck;
  CONFIG.models.writer = env("WRITER_MODEL") ?? MODEL_DEFAULTS[p].writer;
  CONFIG.voice.provider = (env("VOICE_PROVIDER") ??
    (env("ELEVENLABS_API_KEY") ? "elevenlabs" : "openrouter")) as VoiceProvider;
  CONFIG.elevenlabs.apiKey = env("ELEVENLABS_API_KEY") ?? "";
}
