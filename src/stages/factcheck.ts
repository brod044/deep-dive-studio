import { complete } from "../llm.js";
import { CONFIG } from "../config.js";
import { factcheckPrompt } from "../prompts.js";
import type { Flag, ResearchFile } from "../types.js";

/** Stage 2 — cross-reference research files, quarantine suspect claims. */
export async function runFactcheck(
  topic: string,
  research: ResearchFile[],
  onProgress: (msg: string) => void
): Promise<Flag[]> {
  onProgress("factcheck: cross-referencing all research files");
  const raw = await complete({
    model: CONFIG.models.factcheck,
    maxTokens: CONFIG.tokens.factcheck,
    prompt: factcheckPrompt(topic, research),
    label: "factcheck",
    responseFormat: "json_object",
    reasoningEffort: "minimal",
  });
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const json = clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { flags?: Flag[] };
    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    onProgress(`factcheck: ${flags.length} claim(s) quarantined`);
    return flags;
  } catch {
    onProgress("factcheck: output unparseable — proceeding without flags");
    return [];
  }
}
