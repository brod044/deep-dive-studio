import type { CompleteOptions, ProviderResult } from "./llm.js";

/**
 * Test-flight provider: plausible canned output with realistic pacing and
 * simulated usage numbers, so the full pipeline and UI can be exercised
 * without an API key or spend. Selected via `runtime.mock` in llm.ts.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Small deterministic hash so the same prompt yields the same "notes".
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function topicFrom(prompt: string): string {
  const m = prompt.match(/about: (.+?)[.\n]/);
  return m ? m[1].trim() : "the topic";
}

const LABS = ["RCA Labs", "a Bell Labs annex", "a Sony back office", "an Eindhoven workshop", "a Stanford basement", "a Sharp pilot line"];
const PEOPLE = ["Karl Ferdinand Braun", "a team of six engineers", "two rival PhD students", "an ex-radar technician", "a materials chemist nobody credited"];
const NUMBERS = ["about 4,000 units", "a 40% price drop in three years", "an 11-inch prototype", "roughly $2.5 billion in R&D", "a 27-person division", "just under a million units"];

function researchNotes(prompt: string): string {
  const topic = topicFrom(prompt);
  const seed = hash(prompt);
  const lines: string[] = [];
  const n = 10 + (seed % 5);
  for (let i = 0; i < n; i++) {
    const year = 1897 + ((seed >> (i % 20)) % 128);
    const lab = LABS[(seed + i) % LABS.length];
    const who = PEOPLE[(seed + i * 7) % PEOPLE.length];
    const num = NUMBERS[(seed + i * 13) % NUMBERS.length];
    lines.push(
      `- In ${year}, work on ${topic} advanced at ${lab}, led by ${who}, producing ${num} (https://example.com/source-${(seed % 97) + i})`
    );
  }
  return lines.join("\n");
}

function factcheckJson(prompt: string): string {
  const seed = hash(prompt);
  const flags =
    seed % 3 === 0
      ? []
      : [
          {
            claim: "a 40% price drop in three years",
            reason: "Figure appears in two files with different decades attached — likely conflated eras.",
          },
        ];
  return JSON.stringify({ flags });
}

function sectionText(prompt: string): string {
  const topic = topicFrom(prompt);
  const m = prompt.match(/SECTION TO WRITE NOW — (.+?):/);
  const label = m ? m[1] : "this section";
  const seed = hash(prompt);
  const year = 1897 + (seed % 90);
  const paras = [
    `This is test-flight narration for ${label.toLowerCase()}, standing in for the real thing. The story of ${topic} does not begin where you'd expect. It begins in ${year}, in a room that smelled of solder and warm dust, with a piece of equipment that was never meant to leave the bench. The people who built it were not trying to change anything. They were trying to make Thursday's demonstration work.`,
    `What they made worked — barely, and then reliably, and then so reliably that everyone stopped noticing it. That is the usual arc. The interesting part is what it displaced, and what it quietly kept from the generation before: a trick of manufacturing here, a stubborn standard there. Engineers argued about it on paper then; enthusiasts argue about it on forums now. The numbers moved the way numbers move — down when it mattered, up when nobody was looking.`,
    `Keep that image in mind. It will come back later in the episode, because ${topic} never really settles; it only changes who is paying attention.`,
  ];
  return paras.join("\n\n");
}

export async function mockComplete(opts: CompleteOptions): Promise<ProviderResult> {
  const label = opts.label ?? "";
  const seed = hash(opts.prompt);
  if (label.startsWith("research/")) {
    await sleep(1200 + (seed % 1800));
    return {
      text: researchNotes(opts.prompt),
      usage: { promptTokens: 900 + (seed % 300), completionTokens: 700 + (seed % 400), cost: 0.021 + (seed % 20) / 1000 },
    };
  }
  if (label === "factcheck") {
    await sleep(1500);
    return {
      text: factcheckJson(opts.prompt),
      usage: { promptTokens: 5200 + (seed % 500), completionTokens: 120, cost: 0.019 },
    };
  }
  if (label === "recommend") {
    await sleep(900);
    return {
      text: JSON.stringify({
        suggestions: [
          { topic: "The shipping container", focus: "how one steel box rewired the global economy", hook: "The box that ate the waterfront." },
          { topic: "Neon signs", focus: "the craft revival and why LED 'neon' divides sign makers", hook: "A dying trade that refuses to die." },
          { topic: "The compact cassette", focus: "chrome tape, Walkman culture, and the new tape underground", hook: "Hiss was a feature." },
          { topic: "Air traffic control", focus: "why the system still runs on decades-old tech", hook: "The invisible machine above you." },
        ],
      }),
      usage: { promptTokens: 300, completionTokens: 180, cost: 0.002 },
    };
  }
  // section writing (write/*) or anything else
  await sleep(1400 + (seed % 1200));
  return {
    text: sectionText(opts.prompt),
    usage: { promptTokens: 6800 + (seed % 900), completionTokens: 950 + (seed % 300), cost: 0.084 + (seed % 30) / 1000 },
  };
}
