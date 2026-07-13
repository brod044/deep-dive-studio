import { CONFIG } from "../config.js";
import { speech as openrouterSpeech } from "../openrouter.js";
import { emitCall } from "../telemetry.js";
import type { WrittenSection } from "../types.js";

/**
 * Stage 4 (optional) — render the script to a single MP3, via ElevenLabs or
 * OpenRouter's TTS endpoint (CONFIG.voice.provider). Chunked per section
 * (long scripts exceed single-request limits); the MP3 buffers are
 * concatenated, which players handle fine for same-codec frames.
 */
export async function runVoice(
  sections: WrittenSection[],
  onProgress: (msg: string) => void
): Promise<Buffer> {
  const provider = CONFIG.voice.provider;
  const model =
    provider === "openrouter"
      ? CONFIG.voice.openrouterModel
      : CONFIG.elevenlabs.modelId;
  const chunks: Buffer[] = [];
  for (const section of sections) {
    onProgress(`voice/${section.id}: rendering ${section.words} words (${provider})`);
    const t0 = Date.now();
    chunks.push(
      provider === "openrouter"
        ? await openrouterSpeech(section.text)
        : await elevenlabsSpeech(section.text)
    );
    emitCall({
      at: t0,
      label: `voice/${section.id}`,
      provider,
      model,
      ms: Date.now() - t0,
      chars: section.text.length,
    });
  }
  return Buffer.concat(chunks);
}

async function elevenlabsSpeech(text: string): Promise<Buffer> {
  const { apiKey, voiceId, modelId } = CONFIG.elevenlabs;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set — cannot render audio.");
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.55, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
