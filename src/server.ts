import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, reconfigure } from "./config.js";
import { resetClient } from "./anthropic.js";
import { complete, runtime } from "./llm.js";
import { onCall } from "./telemetry.js";
import { log, produceEpisode, slugify } from "./pipeline.js";
import type { EpisodeMeta, Flag } from "./types.js";

/**
 * Deep Dive Studio UI server. Zero dependencies beyond node:http — serves the
 * single-page UI from ui/index.html, a small JSON API over the pipeline, a
 * live SSE event stream (logs + per-call telemetry), and episode audio.
 */

// Resolve against the project root (parent of src/), not cwd, so the server
// works no matter where it's launched from.
const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const PORT = Number(process.env.PORT ?? 8787);
const OUT_DIR = process.env.OUT_DIR ?? join(ROOT, "output");
const UI_FILE = join(ROOT, "ui", "index.html");

// The server owns model overrides per job; remember the configured defaults
// (refreshed when API keys change, since defaults are per-provider).
let DEFAULT_MODELS = { ...CONFIG.models };

// ————————————————— API keys (written to .env, applied live) —————————————————

const KEY_NAMES = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
} as const;

/** Upsert KEY=value lines in the project .env, preserving everything else. */
function saveKeysToEnv(updates: Record<string, string>): void {
  const envPath = join(ROOT, ".env");
  let lines = existsSync(envPath)
    ? readFileSync(envPath, "utf8").split(/\r?\n/)
    : ["# Deep Dive Studio - created by the studio UI"];
  for (const [name, value] of Object.entries(updates)) {
    const line = `${name}=${value}`;
    const idx = lines.findIndex((l) => l.trimStart().startsWith(`${name}=`));
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"));
}

function applyKeys(body: Record<string, unknown>): void {
  if (activeJob) throw new HttpError(409, "Can't change keys while an episode is producing");
  const updates: Record<string, string> = {};
  for (const [field, envName] of Object.entries(KEY_NAMES)) {
    const v = body[field];
    if (typeof v !== "string") continue; // absent = leave unchanged
    const key = v.trim();
    if (key && !/^[\x21-\x7E]{8,256}$/.test(key)) {
      throw new HttpError(400, `${envName} doesn't look like an API key`);
    }
    updates[envName] = key;
    if (key) process.env[envName] = key;
    else delete process.env[envName];
  }
  if (!Object.keys(updates).length) throw new HttpError(400, "No keys provided");
  saveKeysToEnv(updates);
  reconfigure();
  resetClient();
  DEFAULT_MODELS = { ...CONFIG.models };
  log(`API keys updated (${Object.keys(updates).join(", ")}) — provider now ${CONFIG.provider}`);
}

// ————————————————— SSE —————————————————

const sseClients = new Set<ServerResponse>();

function broadcast(event: Record<string, unknown>): void {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) res.write(line);
}

onCall((e) => broadcast({ type: "call", ...e }));

// ————————————————— job management (one at a time) —————————————————

interface ActiveJob {
  slug: string;
  topic: string;
  startedAt: number;
  voice: boolean;
  mock: boolean;
}
let activeJob: ActiveJob | null = null;

interface GenerateBody {
  topic?: string;
  focus?: string;
  voice?: boolean;
  mock?: boolean;
  models?: { research?: string; factcheck?: string; writer?: string };
  voiceProvider?: "elevenlabs" | "openrouter";
  ttsModel?: string;
  ttsVoice?: string;
}

function startJob(body: GenerateBody): { slug: string } {
  const topic = (body.topic ?? "").trim();
  if (!topic) throw new HttpError(400, "topic is required");
  if (activeJob) throw new HttpError(409, `Already producing "${activeJob.topic}"`);

  runtime.mock = !!body.mock;
  CONFIG.models.research = body.models?.research?.trim() || DEFAULT_MODELS.research;
  CONFIG.models.factcheck = body.models?.factcheck?.trim() || DEFAULT_MODELS.factcheck;
  CONFIG.models.writer = body.models?.writer?.trim() || DEFAULT_MODELS.writer;
  if (body.voiceProvider) CONFIG.voice.provider = body.voiceProvider;
  if (body.ttsModel?.trim()) CONFIG.voice.openrouterModel = body.ttsModel.trim();
  if (body.ttsVoice?.trim()) CONFIG.voice.openrouterVoice = body.ttsVoice.trim();

  // Test flight fabricates text only; skip TTS so no real key is needed.
  const voice = runtime.mock ? false : !!body.voice;
  const slug = slugify(topic);
  activeJob = { slug, topic, startedAt: Date.now(), voice, mock: runtime.mock };

  const jobLog = (msg: string) => {
    log(msg);
    broadcast({ type: "log", t: Date.now(), line: msg });
  };
  if (runtime.mock && body.voice) {
    jobLog("Test flight: --voice skipped (no audio is rendered in mock mode).");
  }
  broadcast({ type: "job", status: "started", slug, topic, voice, mock: runtime.mock });

  produceEpisode(
    { topic, focus: body.focus?.trim() || undefined },
    {
      voice,
      outDir: OUT_DIR,
      log: jobLog,
      onSection: (s) =>
        broadcast({ type: "section", id: s.id, label: s.label, text: s.text, words: s.words }),
    }
  )
    .then(() => broadcast({ type: "job", status: "done", slug, topic }))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      jobLog(`PIPELINE HALT — ${msg}`);
      broadcast({ type: "job", status: "error", slug, topic, error: msg });
    })
    .finally(() => {
      activeJob = null;
    });

  return { slug };
}

// ————————————————— episode reading —————————————————

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function listEpisodes(): unknown[] {
  if (!existsSync(OUT_DIR)) return [];
  const episodes: unknown[] = [];
  for (const slug of readdirSync(OUT_DIR)) {
    const dir = join(OUT_DIR, slug);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const meta = readJson<EpisodeMeta>(join(dir, "meta.json"));
    const hasAudio = existsSync(join(dir, "episode.mp3"));
    const hasScript = existsSync(join(dir, "script.md"));
    if (meta) {
      episodes.push({ ...meta, calls: undefined, hasAudio, hasScript });
    } else if (hasScript) {
      // Episode from a pre-meta CLI run — synthesize a listing entry.
      const firstLine = readFileSync(join(dir, "script.md"), "utf8").split("\n")[0] ?? "";
      episodes.push({
        slug,
        topic: firstLine.replace(/^#\s*/, "") || slug,
        focus: null,
        createdAt: statSync(join(dir, "script.md")).mtime.toISOString(),
        status: "done",
        provider: "unknown",
        totalWords: 0,
        estMinutes: 0,
        flagsCount: 0,
        cost: { total: 0, byStage: {} },
        hasAudio,
        hasScript,
      });
    }
  }
  return episodes.sort((a, b) =>
    String((b as { createdAt: string }).createdAt).localeCompare(
      String((a as { createdAt: string }).createdAt)
    )
  );
}

function readEpisode(slug: string): unknown {
  const dir = join(OUT_DIR, slug);
  if (!existsSync(dir)) throw new HttpError(404, "No such episode");
  const meta = readJson<EpisodeMeta>(join(dir, "meta.json"));
  const flags = readJson<Flag[]>(join(dir, "flags.json")) ?? [];

  const sections: { label: string; text: string }[] = [];
  const scriptPath = join(dir, "script.md");
  if (existsSync(scriptPath)) {
    const md = readFileSync(scriptPath, "utf8");
    for (const chunk of md.split(/^## /m).slice(1)) {
      const nl = chunk.indexOf("\n");
      sections.push({ label: chunk.slice(0, nl).trim(), text: chunk.slice(nl + 1).trim() });
    }
  }

  const research: { angle: string; text: string }[] = [];
  const researchDir = join(dir, "research");
  if (existsSync(researchDir)) {
    for (const f of readdirSync(researchDir)) {
      if (!f.endsWith(".md")) continue;
      research.push({ angle: f.replace(/\.md$/, ""), text: readFileSync(join(researchDir, f), "utf8") });
    }
  }

  return {
    meta,
    slug,
    flags,
    sections,
    research,
    hasAudio: existsSync(join(dir, "episode.mp3")),
    scriptTxt: existsSync(join(dir, "script.txt")) ? readFileSync(join(dir, "script.txt"), "utf8") : null,
  };
}

// ————————————————— recommendations —————————————————

const STARTER_SUGGESTIONS = [
  { topic: "TV display technology — CRT to OLED", focus: "the modern CRT revival, whether older tech beats newer", hook: "The tube that refused to die." },
  { topic: "The shipping container", focus: "how one steel box rewired the global economy", hook: "The box that ate the waterfront." },
  { topic: "The compact cassette", focus: "chrome tape, Walkman culture, and the new tape underground", hook: "Hiss was a feature." },
  { topic: "Air traffic control", focus: "why the system still runs on decades-old technology", hook: "The invisible machine above you." },
];

async function recommend(pastTopics: string[]): Promise<unknown> {
  if (!pastTopics.length) return { suggestions: STARTER_SUGGESTIONS, source: "starter" };
  const hasKey = CONFIG.provider === "openrouter" ? !!CONFIG.openrouter.apiKey : !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey && !runtime.mock) return { suggestions: STARTER_SUGGESTIONS, source: "starter" };
  const raw = await complete({
    model: CONFIG.models.research,
    maxTokens: 700,
    label: "recommend",
    prompt: `You commission episodes for a single-narrator documentary podcast about technology, industry, and material culture. A listener has already enjoyed deep dives on these topics:
${pastTopics.map((t) => `- ${t}`).join("\n")}

Suggest 4 NEW episode topics they would fall down a rabbit hole for — adjacent curiosities, not repeats. Respond ONLY with JSON, no markdown fences: {"suggestions":[{"topic":"...","focus":"one steering line for the researchers","hook":"one dry, intriguing sentence"}]}`,
  });
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1)) as {
    suggestions?: unknown[];
  };
  return { suggestions: parsed.suggestions ?? [], source: "model" };
}

// ————————————————— http plumbing —————————————————

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new HttpError(413, "Body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function serveAudio(req: IncomingMessage, res: ServerResponse, slug: string): void {
  const path = join(OUT_DIR, slug, "episode.mp3");
  if (!existsSync(path)) throw new HttpError(404, "No audio for this episode");
  const size = statSync(path).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
    if (start >= size || end < start) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
    });
    createReadStream(path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": size,
      "Accept-Ranges": "bytes",
    });
    createReadStream(path).pipe(res);
  }
}

// ————————————————— router —————————————————

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(readFileSync(UI_FILE, "utf8"));
      return;
    }

    if (req.method === "GET" && path === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", activeJob })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "GET" && path === "/api/state") {
      sendJson(res, 200, {
        provider: CONFIG.provider,
        models: DEFAULT_MODELS,
        voiceProvider: CONFIG.voice.provider,
        ttsModel: CONFIG.voice.openrouterModel,
        ttsVoice: CONFIG.voice.openrouterVoice,
        hasOpenrouterKey: !!CONFIG.openrouter.apiKey,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasElevenlabsKey: !!CONFIG.elevenlabs.apiKey,
        activeJob,
      });
      return;
    }

    if (req.method === "GET" && path === "/api/episodes") {
      sendJson(res, 200, listEpisodes());
      return;
    }

    const epMatch = /^\/api\/episodes\/([a-z0-9-]+)$/.exec(path);
    if (req.method === "GET" && epMatch) {
      sendJson(res, 200, readEpisode(epMatch[1]));
      return;
    }

    const audioMatch = /^\/api\/episodes\/([a-z0-9-]+)\/audio$/.exec(path);
    if (req.method === "GET" && audioMatch) {
      serveAudio(req, res, audioMatch[1]);
      return;
    }

    if (req.method === "POST" && path === "/api/keys") {
      applyKeys(JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>);
      sendJson(res, 200, {
        provider: CONFIG.provider,
        models: DEFAULT_MODELS,
        voiceProvider: CONFIG.voice.provider,
        hasOpenrouterKey: !!CONFIG.openrouter.apiKey,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasElevenlabsKey: !!CONFIG.elevenlabs.apiKey,
      });
      return;
    }

    if (req.method === "POST" && path === "/api/generate") {
      const body = JSON.parse((await readBody(req)) || "{}") as GenerateBody;
      sendJson(res, 202, startJob(body));
      return;
    }

    if (req.method === "POST" && path === "/api/recommendations") {
      const body = JSON.parse((await readBody(req)) || "{}") as { topics?: string[]; mock?: boolean };
      runtime.mock = !!body.mock;
      sendJson(res, 200, await recommend(body.topics ?? []));
      return;
    }

    throw new HttpError(404, "Not found");
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.end();
  }
});

// Localhost only — this server handles API keys and must not be LAN-exposed.
server.listen(PORT, "127.0.0.1", () => {
  log(`Deep Dive Studio UI — http://localhost:${PORT}`);
  log(`Provider: ${CONFIG.provider} · voice: ${CONFIG.voice.provider} · output: ${OUT_DIR}/`);
});
