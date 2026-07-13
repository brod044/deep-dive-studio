# Deep Dive Studio

Turn any topic into a ~30-minute, well-researched, single-narrator documentary
podcast script (and optionally audio), in the style of a longform tech-history
video essay: history → technical breakdown → industry → reception →
present-day sentiment → future.

## Commands

```bash
npm install                # first-time setup
npm run typecheck          # tsc --noEmit — run after every change
npm run ui                 # studio web UI on http://localhost:8787
npm run generate -- --topic "TV display technology"            # research + script
npm run generate -- --topic "..." --focus "CRT revival, TCL"   # steer the angles
npm run generate -- --topic "..." --voice                      # also render MP3 (ElevenLabs/OpenRouter/NanoGPT)
npm run generate -- --topic "..." --research-model "anthropic/Codex-haiku-4.5" \
  --writer-model "anthropic/Codex-opus-4.8"                   # per-run model overrides (--factcheck-model too)
```

Outputs land in `output/<topic-slug>/`:
- `research/<angle>.md` — sourced notes per research angle
- `flags.json` — fact-check quarantine list
- `script.md` / `script.txt` — the episode script
- `meta.json` — status, models used, and the per-call cost ledger
- `episode.mp3` — only with `--voice`

## Architecture (read docs/ARCHITECTURE.md before structural changes)

Three-stage pipeline, orchestrated by `src/pipeline.ts`. LLM calls go through
`src/llm.ts`, which dispatches to a provider client — `src/anthropic.ts`
(direct, Anthropic SDK), `src/openrouter.ts` (OpenRouter, plain fetch), or
`src/nanogpt.ts` (NanoGPT, plain fetch) — based on the selected provider/key
(`LLM_PROVIDER` forces CLI routing). Stages never call a provider client directly.

1. **Research** (`src/stages/research.ts`) — 5 parallel calls to a cheap model
   (default Haiku 4.5) with live web search: the Anthropic server-side
   `web_search_20250305` tool on the direct path, the OpenRouter web plugin
   (`plugins: [{id: "web"}]`, native engine for Anthropic models) on
   OpenRouter, and NanoGPT's hosted `webSearch` enrichment (Exa neural).
   Angles: history, technical, industry, sentiment, future.
   Defined in `src/prompts.ts` (ANGLES).
2. **Fact-check** (`src/stages/factcheck.ts`) — one mid-tier call
   (default Sonnet 4.6) cross-references all research files and returns JSON
   flags. Flagged claims are quarantined — the writer is instructed to never
   use them.
3. **Write** (`src/stages/write.ts`) — sequential per-section calls to the
   best writing model (default Opus 4.8). Sections and the narration
   style guide live in `src/prompts.ts` (SECTIONS, STYLE_GUIDE). Each call gets
   the full research bundle, the quarantine list, and the tail of the previous
   section for continuity.
4. **Voice** (`src/stages/voice.ts`, optional) — TTS chunked per section,
   concatenated to one MP3. ElevenLabs direct or the OpenRouter/NanoGPT
   `/audio/speech` endpoints (`TTS_MODEL`/`TTS_VOICE`); `VOICE_PROVIDER` forces.

Models and token budgets are configured in `src/config.ts` — per-stage,
per-provider defaults, overridable via env vars (see `.env.example`) or the
`--research-model` / `--factcheck-model` / `--writer-model` flags. Never
hardcode a model string anywhere else.

**Around the pipeline:**

- `src/telemetry.ts` — every LLM/TTS call emits a CallEvent (label, model,
  tokens, ms, cost). `llm.ts` emits them; the pipeline collects them into the
  episode's `meta.json`; the server relays them live over SSE. New stages must
  pass a `label` ("stage/detail") to `complete()` — the stage prefix keys the
  cost breakdown.
- `src/mock.ts` — "test flight" provider returning plausible canned output
  with simulated usage, selected via `runtime.mock` in `llm.ts`. Lets the full
  pipeline and UI run keyless with zero spend. Keep it in sync when changing
  stage output shapes.
- `src/server.ts` — zero-dependency `node:http` UI server: static
  `ui/index.html`, JSON API, SSE event stream, range-capable audio, and
  `POST /api/keys` (writes keys into `.env`, applies them live via
  `reconfigure()`). Binds 127.0.0.1 ONLY — it handles API keys; never expose
  it to the network. One production job at a time.
- `ui/index.html` — the whole front end: hand-written single-file vanilla
  HTML/CSS/JS, no build step, no framework. The "bakelite console" visual
  language (palette, IBM Plex Mono/Sans + Bitter) comes from
  `prototype/deep-dive-studio.jsx`. It mirrors ANGLES/SECTIONS ids for the run
  sheet — update both when changing them.

## Invariants — do not break these

- **The writer may only use claims present in the research notes.** Any change
  to writing prompts must preserve the grounding instruction and the
  quarantine list injection.
- **Every research note line must end with a source URL.** The research prompts
  enforce this; keep it when editing them.
- **The style guide bans hype words** ("revolutionary", "game-changing",
  "delve"). Narration is single-voice, read-aloud prose: no headers, bullets,
  or citations in the script body itself.
- **The narration register is deliberate and derived**: Asianometry's
  narrative discipline (chronology, exact figures with movement, full names,
  function-before-jargon, deadpan asides, reversal turns) fused with
  SemiAnalysis's analytical discipline (numbers over narrative, calibrated
  hedging, anti-hype attribution, announced ≠ shipped). STYLE_GUIDE in
  `src/prompts.ts` encodes this rule by rule — edits must keep the rules
  concrete and behavioral, not vague ("be engaging" is banned meta-advice).
- **Research notes must be figure-dense**: exact dates, dollar amounts with
  era, endpoints of any trend, full names and roles, primary sources
  preferred, disagreeing sources both recorded. The noteRules block in
  `src/prompts.ts` enforces this; keep it when editing angle prompts.
- **Web search calls may return `stop_reason: "pause_turn"`** on the direct
  Anthropic path — the loop in `src/anthropic.ts` handles continuation. Don't
  replace it with a single call. (OpenRouter's chat-completions path has no
  pause_turn; the web plugin handles search server-side.)
- Section word targets are set per section in SECTIONS; total should land
  around 4,500–5,500 words (~30 min at 150 wpm).

## Conventions

- TypeScript strict mode; `npm run typecheck` must pass before any commit.
- No new runtime dependencies without a reason written into this file. The
  API surface is small on purpose: `@anthropic-ai/sdk` + `dotenv` + fetch.
- All prompts live in `src/prompts.ts` — never inline prompt text in stages.
- Keep stages pure: they take typed inputs and return typed outputs
  (`src/types.ts`); only `src/pipeline.ts` touches the filesystem.
- Log progress with the `log()` helper in `src/pipeline.ts` so runs are
  legible in the terminal.

## Cost expectations (rough, per episode)

- Research: 5 Haiku calls with up to 10 searches each (search billed on top
  of tokens; OpenRouter native/Exa search ~$5/1k results).
- Fact-check: 1 Sonnet call.
- Writing: 8 Opus calls with a large shared research bundle as input.
- Voice: billed per character; a 5,000-word script is ~30k chars.
Ballpark: a few dollars per episode with default models. On OpenRouter the
exact figure lands in each episode's `meta.json` and the UI Ledger view.

## Current status & near-term roadmap

Working pipeline + studio UI; the pipeline is untested against live provider
APIs — verify with a real key on first run (test flight mode exercises
everything else). See docs/ROADMAP.md. Next priorities:
1. Retry/resume — persist stage outputs so a failed run can resume.
2. True source verification — fetch cited URLs, confirm claims against them.
3. Style iteration harness — regenerate one section without re-researching.
4. Prompt caching on the research bundle across section calls.
