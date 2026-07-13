import { complete } from "../llm.js";
import { CONFIG } from "../config.js";
import { ANGLES } from "../prompts.js";
import type { EpisodeRequest, ResearchFile } from "../types.js";

/** Stage 1 — fan out cheap researchers with live web search, in parallel. */
export async function runResearch(
  req: EpisodeRequest,
  onProgress: (msg: string) => void
): Promise<ResearchFile[]> {
  const topicLine = req.focus
    ? `${req.topic} (listener notes: ${req.focus})`
    : req.topic;

  const results = await Promise.all(
    ANGLES.map(async (angle) => {
      onProgress(`research/${angle.id}: dispatched`);
      const notes = await complete({
        model: CONFIG.models.research,
        maxTokens: CONFIG.tokens.research,
        prompt: angle.prompt(topicLine),
        webSearch: true,
        label: `research/${angle.id}`,
      });
      const lines = notes
        .split("\n")
        .filter((l) => l.trim().startsWith("-")).length;
      onProgress(`research/${angle.id}: ${lines} sourced notes filed`);
      return { angleId: angle.id, label: angle.label, notes };
    })
  );
  return results;
}
