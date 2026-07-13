import assert from "node:assert/strict";
import { CONFIG } from "../dist/config.js";
import { complete } from "../dist/llm.js";
import { speech } from "../dist/nanogpt.js";
import { onCall } from "../dist/telemetry.js";

CONFIG.nanogpt.apiKey = "test-key-not-sent";
CONFIG.nanogpt.baseUrl = "https://nanogpt.test/api/v1";

const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), body: JSON.parse(String(init.body ?? "{}")) });
  if (String(url).endsWith("/audio/speech")) {
    return new Response(Uint8Array.from([0x49, 0x44, 0x33, 0x04]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  }
  return Response.json({
    choices: [{
      finish_reason: "stop",
      message: {
        content: "- A grounded fact",
        annotations: [{
          type: "url_citation",
          url_citation: { url: "https://example.com/source", start_index: 0, end_index: 17 },
        }],
      },
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
};

try {
  const events = [];
  const unsubscribe = onCall((event) => events.push(event));
  const text = await complete({
    model: CONFIG.models.research,
    maxTokens: 500,
    prompt: "Research this topic",
    webSearch: true,
    provider: "nanogpt",
    label: "research/test",
  });
  unsubscribe();
  assert.match(text, /\(https:\/\/example\.com\/source\)$/);
  assert.equal(events[0].provider, "nanogpt");
  assert.equal(events[0].webSources, 1);
  assert.deepEqual(requests[0].body.webSearch, {
    enabled: true,
    provider: "exa",
    depth: "neural",
    numResults: CONFIG.searchesPerAngle,
  });

  const audio = await speech("A short narration test.");
  assert.equal(audio.length, 4);
  assert.equal(requests[1].body.model, CONFIG.voice.model);
  assert.equal(requests[1].body.voice, CONFIG.voice.voice);
  assert.equal(requests[1].body.response_format, "mp3");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("NanoGPT adapter contract passed");
