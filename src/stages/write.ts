import { complete } from "../llm.js";
import { CONFIG } from "../config.js";
import { SECTIONS, sectionPrompt } from "../prompts.js";
import type { EpisodeRequest, Flag, ResearchFile, WrittenSection } from "../types.js";

/** Stage 3 — write the script section by section with a top-tier model. */
export async function runWriter(
  req: EpisodeRequest,
  research: ResearchFile[],
  flags: Flag[],
  onProgress: (msg: string) => void,
  onSection?: (section: WrittenSection) => void,
  existing: WrittenSection[] = []
): Promise<WrittenSection[]> {
  const written: WrittenSection[] = [];
  const saved = new Map(existing.map((section) => [section.id, section]));
  for (const section of SECTIONS) {
    const checkpoint = saved.get(section.id);
    if (checkpoint) {
      written.push(checkpoint);
      onProgress(`write/${section.id}: resumed ${checkpoint.words} saved words`);
      onSection?.(checkpoint);
      continue;
    }
    onProgress(`write/${section.id}: drafting`);
    const previousTail = written.length
      ? written[written.length - 1].text.split(/\s+/).slice(-90).join(" ")
      : undefined;
    const text = await complete({
      model: CONFIG.models.writer,
      maxTokens: CONFIG.tokens.section,
      label: `write/${section.id}`,
      prompt: sectionPrompt({
        topic: req.topic,
        focus: req.focus,
        section,
        research,
        flags,
        previousTail,
      }),
    });
    const result: WrittenSection = {
      id: section.id,
      label: section.label,
      text,
      words: text.split(/\s+/).length,
    };
    written.push(result);
    onProgress(`write/${section.id}: ${result.words} words`);
    onSection?.(result);
  }
  return written;
}
