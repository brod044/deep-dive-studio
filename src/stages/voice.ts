import { CONFIG } from "../config.js";
import { speech as openrouterSpeech } from "../openrouter.js";
import { emitCall } from "../telemetry.js";
import type { WrittenSection } from "../types.js";

const SHORT_FORM_TTS_MODELS = new Set(["sesame/csm-1b"]);

export function supportsLongFormTts(model: string): boolean {
  return !SHORT_FORM_TTS_MODELS.has(model);
}

/**
 * Stage 4 (optional) — render the script to a single MP3, via ElevenLabs or
 * OpenRouter's TTS endpoint (CONFIG.voice.provider). Each section is divided
 * again at sentence boundaries so upstream character limits cannot silently
 * truncate narration. MP3 metadata is removed before frame concatenation so
 * browsers do not interpret each chunk as a new file and jump during playback.
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
  if (provider === "openrouter" && !supportsLongFormTts(model)) {
    throw new Error(
      `${model} is a short-form conversational voice capped at about 10 seconds per request. ` +
      "Choose a long-form TTS model before rendering this documentary."
    );
  }
  const chunks: Buffer[] = [];
  for (const section of sections) {
    const sectionChunks = chunkSpeechText(section.text, CONFIG.voice.chunkChars);
    onProgress(
      `voice/${section.id}: rendering ${section.words} words in ${sectionChunks.length} chunk${sectionChunks.length === 1 ? "" : "s"} (${provider})`
    );
    for (let i = 0; i < sectionChunks.length; i++) {
      const text = sectionChunks[i];
      const t0 = Date.now();
      const audio = provider === "openrouter"
        ? await openrouterSpeech(text)
        : await elevenlabsSpeech(text);
      emitCall({
        at: t0,
        label: `voice/${section.id}/${i + 1}`,
        provider,
        model,
        ms: Date.now() - t0,
        chars: text.length,
      });
      if (provider === "openrouter") {
        const duration = estimateMp3Duration(audio);
        const words = text.split(/\s+/).filter(Boolean).length;
        const minimumCompleteDuration = (words / 320) * 60;
        if (duration != null && words >= 60 && duration < minimumCompleteDuration) {
          throw new Error(
            `${model} returned only ${duration.toFixed(1)} seconds for ${words} words, so narration was truncated. ` +
            "Choose a long-form TTS model and render again."
          );
        }
      }
      chunks.push(cleanMp3Chunk(audio));
    }
  }
  return Buffer.concat(chunks);
}

/** Split without losing words, preferring paragraph and sentence boundaries. */
export function chunkSpeechText(text: string, maxChars = 3000): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];
  const chunks: string[] = [];
  let start = 0;
  while (normalized.length - start > maxChars) {
    const window = normalized.slice(start, start + maxChars + 1);
    const minimum = Math.floor(maxChars * 0.6);
    let cut = -1;
    const boundary = /[.!?]["')\]]?\s+/g;
    for (let match = boundary.exec(window); match; match = boundary.exec(window)) {
      const candidate = match.index + match[0].trimEnd().length;
      if (candidate >= minimum && candidate <= maxChars) cut = candidate;
    }
    if (cut < minimum) cut = window.lastIndexOf(" ", maxChars);
    if (cut < minimum) cut = maxChars;
    chunks.push(normalized.slice(start, start + cut));
    start += cut;
    while (normalized[start] === " ") start++;
  }
  if (start < normalized.length) chunks.push(normalized.slice(start));
  return chunks;
}

interface Mp3FrameInfo {
  length: number;
  sampleRate: number;
  samples: number;
}

function mp3FrameInfo(input: Buffer, offset: number): Mp3FrameInfo | null {
  if (offset + 4 > input.length || input[offset] !== 0xff || (input[offset + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (input[offset + 1] >> 3) & 0x03;
  const layerBits = (input[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (input[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (input[offset + 2] >> 2) & 0x03;
  const padding = (input[offset + 2] >> 1) & 0x01;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const mpeg1 = versionBits === 3;
  const bitrateTable = mpeg1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const baseRates = [44100, 48000, 32000];
  const divisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
  const sampleRate = baseRates[sampleRateIndex] / divisor;
  const bitrate = bitrateTable[bitrateIndex];
  const length = Math.floor(((mpeg1 ? 144000 : 72000) * bitrate) / sampleRate) + padding;
  return { length, sampleRate, samples: mpeg1 ? 1152 : 576 };
}

function audioStart(input: Buffer): number {
  let start = 0;
  while (start + 10 <= input.length && input.toString("ascii", start, start + 3) === "ID3") {
    const flags = input[start + 5];
    const size =
      ((input[start + 6] & 0x7f) << 21) |
      ((input[start + 7] & 0x7f) << 14) |
      ((input[start + 8] & 0x7f) << 7) |
      (input[start + 9] & 0x7f);
    start += 10 + size + (flags & 0x10 ? 10 : 0);
  }
  return start;
}

export function estimateMp3Duration(input: Buffer): number | null {
  let offset = audioStart(input);
  let samples = 0;
  let sampleRate = 0;
  while (offset + 4 <= input.length) {
    const frame = mp3FrameInfo(input, offset);
    if (!frame || offset + frame.length > input.length) {
      offset++;
      continue;
    }
    samples += frame.samples;
    sampleRate = frame.sampleRate;
    offset += frame.length;
  }
  return samples && sampleRate ? samples / sampleRate : null;
}

/** Remove ID3 and per-request VBR headers before joining MP3 frame streams. */
export function cleanMp3Chunk(input: Buffer): Buffer {
  let start = audioStart(input);
  let end = input.length;
  if (end - start >= 128 && input.toString("ascii", end - 128, end - 125) === "TAG") end -= 128;
  const firstFrame = mp3FrameInfo(input, start);
  if (firstFrame && start + firstFrame.length <= end) {
    const marker = input.toString("ascii", start, start + firstFrame.length);
    if (marker.includes("Xing") || marker.includes("Info") || marker.includes("VBRI")) {
      start += firstFrame.length;
    }
  }
  return input.subarray(start, end);
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
