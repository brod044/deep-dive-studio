import type { Angle, Flag, ResearchFile, Section } from "./types.js";

// ————————————————— research angles —————————————————
//
// Evidence standards are per-angle on purpose: forums are legitimate sources
// for sentiment and poison for facts. Every prompt demands the specificity the
// writer will need — the script can only be as concrete as these notes.

const noteRules = `NOTE RULES (strict):
- One fact per line, start each line with "- ". Every line MUST end with the source URL in parentheses.
- Prefer exact figures over generalities: years AND months where known, dollar amounts (with the era's dollars noted), unit counts, percentages, market shares, prices at launch and prices later.
- Name people (full names and roles), companies, labs, cities, and specific product model numbers/names.
- Where a number changed over time, capture both endpoints ("from X in YEAR to Y in YEAR").
- Prefer primary sources and contemporaneous reporting over retrospective summaries; prefer spec sheets, filings, and trade press over general-interest rewrites.
- If sources disagree on a figure, include both lines with both sources.
- No intro or outro text — notes only.`;

export const ANGLES: Angle[] = [
  {
    id: "history",
    label: "History",
    prompt: (topic) => `You are a research assistant for a longform tech-history documentary about: ${topic}.
Use web search extensively (multiple searches, different phrasings). Compile dense CHRONOLOGICAL research notes on the invention and evolution of this topic: every major innovation with exact dates, where each was discovered and developed, the specific people and labs behind them, what each cost, how long each took to commercialize, and how each generation displaced the last. Capture the near-misses too: the rival approaches that lost, and why. Note any moment where the expected winner failed and something else won instead — those turns are documentary gold.
${noteRules}`,
  },
  {
    id: "technical",
    label: "Technical",
    prompt: (topic) => `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search. Compile research notes on HOW the major variants/technologies within this topic physically work: the underlying physics and engineering, the manufacturing process step by step (with yields, defect rates, or line costs where reported), why each approach has its characteristic strengths and weaknesses, and the honest trade-offs between older and newer approaches — including any genuine, measurable advantages older technology retains (latency, longevity, serviceability, cost). Capture the numbers engineers actually argue about: response times, efficiencies, tolerances, unit costs.
${noteRules}`,
  },
  {
    id: "industry",
    label: "Industry & players",
    prompt: (topic) => `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search. Compile research notes on the INDUSTRY: major companies past and present with revenue/market-share figures and dates, national and regional manufacturing shifts (which country/city dominated when, and why production moved), pricing trends over time with actual price points, famous marketing campaigns and format wars (who spent what, who won), notable business failures and exits with the dollar amounts involved, and any government subsidies, tariffs, or antitrust actions that shaped the market. Note where the consensus narrative about a company differs from what the numbers show.
${noteRules}`,
  },
  {
    id: "sentiment",
    label: "Sentiment & culture",
    prompt: (topic) => `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search, deliberately including enthusiast forums, Reddit threads, and recent articles. Compile research notes on SENTIMENT: how people felt about each technology at the time (launch reviews with scores or verdicts, hype, complaints, controversies, prices people balked at), and how communities feel TODAY — revival and retro movements, collector culture and what collectors pay now, current enthusiast arguments and the strongest claim each side makes, and generational dynamics.
Attribute clearly (e.g. "r/crtgaming users commonly argue...", "a 1998 review in X complained...") and mark opinions as opinions — never as fact.
${noteRules}`,
  },
  {
    id: "future",
    label: "The future",
    prompt: (topic) => `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search focused on RECENT news (last 2 years where possible). Compile research notes on THE FUTURE: emerging technologies and research directions with reported specs or lab results, where R&D money is flowing (specific investment amounts, fab/factory announcements, dated roadmaps), which companies and countries are pushing hardest, credible timelines from primary announcements, and — critically — expert skepticism: who says the roadmap slips, which promised technology has missed dates before, and what the failure modes are. Distinguish announced from shipped.
${noteRules}`,
  },
];

// ————————————————— narration style —————————————————
//
// The register: Asianometry's narrative documentary voice fused with
// SemiAnalysis's analytical discipline. Derived from close reading of both;
// the rules below are what actually makes that voice, spelled out.

export const STYLE_GUIDE = `VOICE & STYLE (follow strictly — this register is the product):

DELIVERY
- Single narrator, written to be READ ALOUD. No headers, no bullet points, no citations in the text — flowing spoken prose only.
- Dry, understated, precise. The register of a good industrial-history documentary: specific over vague, numbers and names over adjectives.
- Vary rhythm deliberately: short declarative sentences for turns and verdicts; longer sentences to unpack a process or a deal. A three-beat construction lands emphasis well ("capital-hungry, patent-fenced, and slow to forgive mistakes") — use it sparingly.
- The occasional wry, deadpan aside is welcome — one per section at most. Self-aware, never jokey.

NUMBERS AND NAMES (the Asianometry discipline)
- Anchor every development in specifics from the notes: the year, the place, the person with their full name and role, the dollar figure with its era, the unit count.
- Give figures with their movement, not in isolation: "from around $2,000 at launch to under $400 three years later" beats "prices fell."
- Explain technology by function before naming it: say what the thing does in physical, concrete terms, then give it its proper name. Physical analogies only where they genuinely clarify.
- Exploit reversal where the research supports it: "X was supposed to win. Then Y happened." The gap between plan and outcome is the engine of this genre.

ANALYTICAL HONESTY (the SemiAnalysis discipline)
- When the notes show a consensus narrative and numbers that disagree, say so plainly and side with the numbers.
- Attribute momentum honestly: distinguish what a company's technology earned from what the market cycle handed it.
- Calibrate hedging to evidence: state well-sourced facts flat; mark estimates ("reportedly", "by most accounts"); mark speculation as speculation. Never hedge everything equally — it reads as mush.
- Treat roadmaps and announcements with polite suspicion; note when the same promise has missed dates before, if the research says so.
- Enthusiasm is expressed through specificity, never hype words ("revolutionary", "game-changing", "delve" are banned).

GROUNDING (non-negotiable)
- Ground every claim in the research notes provided. If the notes don't support a claim, do not make it. Never invent statistics, quotes, or dates.
- Attribute sentiment honestly ("forum users often argue...", "reviewers at the time complained...") and keep opinion labeled as opinion.
- Assume an intelligent listener who knows nothing about this specific topic. Respect them: explain from first principles, briefly and concretely, then move.`;

export const SECTIONS: Section[] = [
  {
    id: "cold-open",
    label: "Cold open",
    brief:
      "A 250–400 word cold open. Start inside one concrete, surprising scene, fact, or tension from the research — a specific place, year, and person if the notes have them. Never start with a definition or 'imagine'. Establish, through specifics, why this topic is worth 30 minutes. End by laying out, in one or two sentences, the journey the episode will take, then a simple spoken title line for the episode.",
  },
  {
    id: "origins",
    label: "Part 1 — Origins",
    brief:
      "600–750 words. The chronological early history: the founding inventions with dates and places, the people and labs involved (full names, roles), what things cost, and the first commercialization — including the rival approaches that lost and why. Rely primarily on the HISTORY notes. If the expected winner didn't win, make that turn explicit.",
  },
  {
    id: "how-it-works",
    label: "Part 2 — How it works",
    brief:
      "600–750 words. The technical breakdown: explain how each major variant physically works, in chronological order — function first, name second — and why each has its characteristic strengths and flaws, with the actual numbers engineers argue about. Rely primarily on the TECHNICAL notes. Keep it concrete and physical; one analogy only if it genuinely clarifies.",
  },
  {
    id: "industry",
    label: "Part 3 — The industry",
    brief:
      "600–750 words. The business story: the major companies with real figures, manufacturing geography and why it shifted, the marketing battles and format wars with what was spent and who won, prices falling over time with actual price points, who won and who died and for how much. Rely primarily on the INDUSTRY notes. Where the folk narrative and the numbers disagree, side with the numbers and say so.",
  },
  {
    id: "reception",
    label: "Part 4 — Reception & controversy",
    brief:
      "500–650 words. How people felt at the time: the hype, the complaints with their specifics (what exactly reviewers panned, what early adopters paid), the controversies, the transitions consumers resisted or embraced. Attribute everything — publications, forums, eras. Rely primarily on the historical portions of the SENTIMENT notes.",
  },
  {
    id: "today",
    label: "Part 5 — The present",
    brief:
      "550–700 words. The current state: today's market and dominant players with current figures, pricing dynamics, and modern community sentiment — revival and retro movements, collector culture and what things fetch now, what enthusiasts argue about, and any genuine measurable advantages older technology retains. Distinguish what today's leaders earned from what the cycle handed them. Rely on the SENTIMENT and INDUSTRY notes.",
  },
  {
    id: "future",
    label: "Part 6 — The future",
    brief:
      "500–650 words. Where it's going: emerging technologies with reported specs, where the R&D money is actually flowing (amounts, dates), which companies and countries are pushing hardest, realistic timelines — and the skeptics' case, given equal weight. Note which promises have slipped before if the research says so. Distinguish announced from shipped. Rely primarily on the FUTURE notes.",
  },
  {
    id: "closing",
    label: "Closing",
    brief:
      "250–350 words. A synthesis, not a summary: one clear-eyed observation about what this topic's arc says about technology, markets, or people. If the research offers a person or place from the beginning of the story, circle back to them. End dry and slightly abrupt, documentary style. No 'thanks for listening' filler, no recap.",
  },
];

// ————————————————— prompt builders —————————————————

export function recommendationPrompt(pastTopics: string[], avoidTopics: string[] = []): string {
  const avoid = avoidTopics.length
    ? `\nThe previous suggestion set was:\n${avoidTopics.map((topic) => `- ${topic}`).join("\n")}\nDo not repeat or lightly reword any of those suggestions.`
    : "";
  return `You commission episodes for a single-narrator documentary podcast about technology, industry, and material culture. A listener has already enjoyed deep dives on these topics:
${pastTopics.map((topic) => `- ${topic}`).join("\n")}
${avoid}

Suggest 4 NEW episode topics they would fall down a rabbit hole for — adjacent curiosities, not repeats. Respond ONLY with JSON, no markdown fences: {"suggestions":[{"topic":"...","focus":"one steering line for the researchers","hook":"one dry, intriguing sentence"}]}`;
}

export function factcheckPrompt(topic: string, research: ResearchFile[]): string {
  const files = research
    .map((r) => `=== ${r.angleId.toUpperCase()} FILE ===\n${r.notes}`)
    .join("\n\n");
  return `You are the fact-check desk for a documentary about: ${topic}.
Below are ${research.length} research files. Identify claims that are (a) contradicted by another file or by another line in the same file, (b) implausible on their face (impossible dates, magnitudes off by orders of magnitude), (c) stated as fact while lacking a credible source, or (d) marketing/press-release figures repeated as independent fact. Respond ONLY with JSON, no markdown fences, in the shape {"flags":[{"claim":"short quote of the claim","reason":"why it is suspect"}]}. If nothing is suspect, return {"flags":[]}.

${files}`;
}

export function sectionPrompt(args: {
  topic: string;
  focus?: string;
  section: Section;
  research: ResearchFile[];
  flags: Flag[];
  previousTail?: string;
}): string {
  const { topic, focus, section, research, flags, previousTail } = args;
  const bundle = research
    .map((r) => `=== ${r.angleId.toUpperCase()} NOTES ===\n${r.notes}`)
    .join("\n\n");
  const flagText = flags.length
    ? `\nQUARANTINED CLAIMS — do NOT use these in the script:\n${flags
        .map((f) => `- ${f.claim} (${f.reason})`)
        .join("\n")}`
    : "";
  const continuity = previousTail
    ? `\nFor continuity, the previous section ended with:\n"…${previousTail}"`
    : "";
  return `You are the scriptwriter for a longform audio documentary episode about: ${topic}.
${focus ? `The listener specifically asked to cover: ${focus}\n` : ""}
${STYLE_GUIDE}

SECTION TO WRITE NOW — ${section.label}:
${section.brief}
${continuity}

Output ONLY the narration text for this section. No headers, no labels, no notes.
${flagText}

RESEARCH FILES:
${bundle}`;
}
