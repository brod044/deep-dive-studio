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
      const rawNotes = await complete({
        model: CONFIG.models.research,
        maxTokens: CONFIG.tokens.research,
        prompt: angle.prompt(topicLine),
        webSearch: true,
        label: `research/${angle.id}`,
      });
      const noteLines = rawNotes
        .split("\n")
        .filter((l) => l.trim().startsWith("-"));
      const sourcedLines = noteLines.filter((l) =>
        /\(https?:\/\/[^\s)]+\)\s*$/.test(l.trim())
      );
      const dropped = noteLines.length - sourcedLines.length;
      if (sourcedLines.length < 5) {
        throw new Error(
          `research/${angle.id}: only ${sourcedLines.length} notes had full source URLs`
        );
      }
      const notes = sourcedLines.join("\n");
      onProgress(
        `research/${angle.id}: ${sourcedLines.length} sourced notes filed` +
          (dropped ? ` (${dropped} unsourced dropped)` : "")
      );
      return { angleId: angle.id, label: angle.label, notes };
    })
  );
  return results;
}
