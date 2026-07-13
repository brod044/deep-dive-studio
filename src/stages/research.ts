import { complete } from "../llm.js";
import { CONFIG } from "../config.js";
import { ANGLES, researchRetryPrompt } from "../prompts.js";
import type { EpisodeRequest, ResearchFile } from "../types.js";

interface ResearchOptions {
  existing?: ResearchFile[];
  onFile?: (file: ResearchFile) => void;
}

function sourcedNoteLines(rawNotes: string): { lines: string[]; dropped: number } {
  const noteLines = rawNotes
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:[*•▪◦]|\d+[.)])\s+/, "- ")
        .replace(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)\s*$/, "($1)")
        .replace(/<((?:https?):\/\/[^>\s]+)>\s*$/, "($1)")
        .replace(/\s+(?:Source:\s*)?(https?:\/\/[^\s)]+)\s*$/i, " ($1)")
    )
    .filter((line) => line.trim().startsWith("-"));
  const lines = noteLines.filter((line) =>
    /\(https?:\/\/[^\s)]+\)\s*$/.test(line.trim())
  );
  return { lines, dropped: noteLines.length - lines.length };
}

/** Stage 1 — fan out cheap researchers with live web search, in parallel. */
export async function runResearch(
  req: EpisodeRequest,
  onProgress: (msg: string) => void,
  options: ResearchOptions = {}
): Promise<ResearchFile[]> {
  const topicLine = req.focus
    ? `${req.topic} (listener notes: ${req.focus})`
    : req.topic;

  const existing = new Map(
    (options.existing ?? []).map((file) => [file.angleId, file])
  );
  const settled = await Promise.allSettled(
    ANGLES.map(async (angle) => {
      const saved = existing.get(angle.id);
      if (saved) return saved;

      onProgress(`research/${angle.id}: dispatched`);
      for (let attempt = 0; attempt < 2; attempt++) {
        const rawNotes = await complete({
          model: CONFIG.models.research,
          maxTokens: CONFIG.tokens.research,
          prompt:
            attempt === 0
              ? angle.prompt(topicLine)
              : researchRetryPrompt(angle, topicLine),
          webSearch: true,
          label: `research/${angle.id}`,
        });
        const { lines: sourcedLines, dropped } = sourcedNoteLines(rawNotes);
        if (sourcedLines.length < 5) {
          if (attempt === 0) {
            onProgress(
              `research/${angle.id}: ${sourcedLines.length} usable sourced notes; retrying format once`
            );
            continue;
          }
          throw new Error(
            `research/${angle.id}: only ${sourcedLines.length} notes had full source URLs after retry`
          );
        }
        const file = {
          angleId: angle.id,
          label: angle.label,
          notes: sourcedLines.join("\n"),
        };
        onProgress(
          `research/${angle.id}: ${sourcedLines.length} sourced notes filed` +
            (dropped ? ` (${dropped} unsourced dropped)` : "")
        );
        options.onFile?.(file);
        return file;
      }
      throw new Error(`research/${angle.id}: exhausted format retries`);
    })
  );

  const failure = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure) throw failure.reason;
  return settled.map((result) => (result as PromiseFulfilledResult<ResearchFile>).value);
}
