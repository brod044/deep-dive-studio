import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG } from "./config.js";
import { runtime } from "./llm.js";
import { onCall } from "./telemetry.js";
import type { CallEvent } from "./telemetry.js";
import { runResearch } from "./stages/research.js";
import { runFactcheck } from "./stages/factcheck.js";
import { runWriter } from "./stages/write.js";
import { runVoice } from "./stages/voice.js";
import { ANGLES } from "./prompts.js";
import type {
  Episode,
  EpisodeMeta,
  EpisodeRequest,
  Flag,
  ResearchFile,
  WrittenSection,
} from "./types.js";

export function log(msg: string): void {
  const t = new Date().toLocaleTimeString([], { hour12: false });
  console.log(`[${t}] ${msg}`);
}

export function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function summarizeCost(calls: CallEvent[]): { total: number; byStage: Record<string, number> } {
  const byStage: Record<string, number> = {};
  let total = 0;
  for (const c of calls) {
    if (typeof c.cost !== "number") continue;
    const stage = c.label.split("/")[0];
    byStage[stage] = (byStage[stage] ?? 0) + c.cost;
    total += c.cost;
  }
  return { total, byStage };
}

export interface ProduceOptions {
  voice: boolean;
  outDir: string;
  /** Reuse complete research/fact-check artifacts already saved for this slug. */
  resume?: boolean;
  /** Progress sink; defaults to the console logger. */
  log?: (msg: string) => void;
  /** Fired as each section finishes — lets the UI stream the script live. */
  onSection?: (section: WrittenSection) => void;
}

export async function produceEpisode(
  req: EpisodeRequest,
  opts: ProduceOptions
): Promise<Episode> {
  const logger = opts.log ?? log;
  const slug = slugify(req.topic);
  const dir = join(opts.outDir, slug);
  const researchDir = join(dir, "research");
  mkdirSync(researchDir, { recursive: true });
  logger(`Commissioned: "${req.topic}"${req.focus ? ` — focus: ${req.focus}` : ""}`);
  logger(`Output: ${dir}`);

  // Accounting: collect every model/TTS call for this run into meta.json.
  const previousMeta = opts.resume
    ? readJson<EpisodeMeta>(join(dir, "meta.json"))
    : null;
  const calls: CallEvent[] = [...(previousMeta?.calls ?? [])];
  const meta: EpisodeMeta = {
    slug,
    topic: req.topic,
    focus: req.focus ?? null,
    createdAt: previousMeta?.createdAt ?? new Date().toISOString(),
    status: "running",
    error: null,
    provider: runtime.mock ? "mock" : CONFIG.provider,
    models: { ...CONFIG.models },
    voice: opts.voice,
    totalWords: 0,
    estMinutes: 0,
    flagsCount: 0,
    calls,
    cost: { total: 0, byStage: {} },
  };
  const writeMeta = () => {
    meta.cost = summarizeCost(calls);
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  };
  const unsubscribe = onCall((e) => {
    calls.push(e);
    writeMeta();
  });
  writeMeta();

  try {
    // Stage 1 — research
    let research = opts.resume ? loadResearch(researchDir) : null;
    if (research) {
      logger(`research: resumed ${research.length} saved files`);
    } else {
      research = await runResearch(req, logger);
      for (const file of research) {
        writeFileSync(
          join(researchDir, `${file.angleId}.md`),
          `# ${file.label} — ${req.topic}\n\n${file.notes}\n`
        );
      }
    }

    // Stage 2 — fact-check
    let flags = opts.resume ? readJson<Flag[]>(join(dir, "flags.json")) : null;
    if (flags) {
      logger(`factcheck: resumed ${flags.length} saved flag(s)`);
    } else {
      flags = await runFactcheck(req.topic, research, logger);
      writeFileSync(join(dir, "flags.json"), JSON.stringify(flags, null, 2));
    }
    meta.flagsCount = flags.length;
    writeMeta();

    // Stage 3 — write
    const sections = await runWriter(req, research, flags, logger, (section) => {
      // Persist incrementally so a crash doesn't lose finished sections.
      const partial = join(dir, `_partial-${section.id}.txt`);
      writeFileSync(partial, section.text);
      opts.onSection?.(section);
    });

    const totalWords = sections.reduce((n, s) => n + s.words, 0);
    const estMinutes = Math.round(totalWords / CONFIG.wordsPerMinute);

    const scriptTxt = sections
      .map((s) => `${s.label.toUpperCase()}\n\n${s.text}`)
      .join("\n\n\n");
    const scriptMd = [
      `# ${req.topic}`,
      ``,
      `> ${totalWords} words · ≈${estMinutes} min read-aloud`,
      ``,
      ...sections.map((s) => `## ${s.label}\n\n${s.text}`),
    ].join("\n");
    writeFileSync(join(dir, "script.txt"), scriptTxt);
    writeFileSync(join(dir, "script.md"), scriptMd);
    logger(`Script complete — ${totalWords} words, ≈${estMinutes} min.`);
    meta.totalWords = totalWords;
    meta.estMinutes = estMinutes;
    writeMeta();

    // Stage 4 — voice (optional)
    if (opts.voice) {
      const mp3 = await runVoice(sections, logger);
      writeFileSync(join(dir, "episode.mp3"), mp3);
      logger(`Audio rendered: ${join(dir, "episode.mp3")}`);
    }

    meta.status = "done";
    writeMeta();
    return { request: req, research, flags, sections, totalWords, estMinutes };
  } catch (err) {
    meta.status = "error";
    meta.error = err instanceof Error ? err.message : String(err);
    writeMeta();
    throw err;
  } finally {
    unsubscribe();
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadResearch(researchDir: string): ResearchFile[] | null {
  const files: ResearchFile[] = [];
  for (const angle of ANGLES) {
    const path = join(researchDir, `${angle.id}.md`);
    if (!existsSync(path)) return null;
    const notes = readFileSync(path, "utf8")
      .replace(/^#.*\r?\n\s*/, "")
      .trim();
    if (!notes) return null;
    files.push({ angleId: angle.id, label: angle.label, notes });
  }
  return files;
}
