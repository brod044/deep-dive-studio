# Architecture

## Design philosophy

The quality bottleneck for AI-generated documentary audio is not the voice —
it's the research and the writing. So the pipeline separates concerns by cost:

- **Cheap models do the reading.** Research is parallelizable, tolerant of a
  weaker model, and dominated by search cost. Five angle-specialized
  researchers beat one generalist because each prompt can enforce different
  evidence standards (forums are legitimate sources for *sentiment*, poison
  for *facts*).
- **A mid-tier model does the doubting.** Fact-checking is verification, not
  generation. It reads everything once and outputs a small quarantine list.
- **The best model does the writing.** Prose quality is where readers/listeners
  feel the difference, and it's a small fraction of total tokens.

## Data flow

```
topic (+focus)
   │
   ▼
┌─ Stage 1: research.ts ── 5 parallel calls, web_search tool ──┐
│  history · technical · industry · sentiment · future         │
│  each returns "- fact (url)" note lines                      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
   Stage 2: factcheck.ts — one call, all files as input,
   returns JSON flags → quarantine list
                           ▼
   Stage 3: write.ts — 8 sequential calls, one per section.
   Input per call: full research bundle + quarantine list +
   style guide + previous section's last 90 words (continuity)
                           ▼
   Stage 4 (optional): voice.ts — sentence-aware TTS chunks,
   duration validation + MP3 frame stitching
```

All stages are pure (typed in/out). Only `pipeline.ts` (and the UI server, for
reading) touches disk, writing every intermediate artifact so runs are
inspectable and debuggable: `output/<slug>/research/*.md`, `flags.json`,
`_partial-*.txt`, `script.{txt,md}`, and `meta.json` (status + cost ledger).

## Providers, telemetry, and the studio UI

- `llm.ts` is the only door to a model: it dispatches to `anthropic.ts`
  (direct SDK, pause_turn loop) or `openrouter.ts` (plain fetch, web plugin,
  `usage: {include: true}` for exact cost), or `mock.ts` in test-flight mode.
- Every call emits a `telemetry.ts` CallEvent (label, model, tokens, ms,
  cost). The pipeline folds these into `meta.json`; the server streams them
  live to the UI. That one event bus powers both the debug view and the cost
  analysis — don't add a second accounting path.
- `server.ts` (zero-dependency `node:http`, localhost-only) serves the
  single-file vanilla UI (`ui/index.html`), a small JSON API, an SSE stream
  (logs, calls, live sections), range-capable audio, and key management
  (`POST /api/keys` → `.env` + live `reconfigure()`).

## The narration register (why the style guide looks like that)

STYLE_GUIDE in `prompts.ts` is derived from close reading of Asianometry
(narrative spine: chronology, exact figures with movement, full names,
function-before-jargon, deadpan asides, plan-vs-outcome reversals) and
SemiAnalysis (analytical spine: absolute+relative numbers together, consensus
named then challenged, hedging calibrated to evidence strength, announced ≠
shipped). The rules are deliberately behavioral — each one is checkable
against a script line. The research prompts are figure-hungry for the same
reason: the writer can only be as concrete as the notes.

## Why sequential section writing

One-shot generation of 5,000 words drifts: structure flattens, the voice goes
generic, later sections ignore earlier ones. Per-section calls keep each
generation short (where models are strongest), enforce word budgets per part,
and let us regenerate one section without redoing the run (roadmap item).

## Known weaknesses (be honest with users of this code)

- Note lines cite URLs, but the fact-checker doesn't fetch them — it checks
  cross-file consistency and plausibility, not source fidelity. True
  claim-to-source verification (fetch + compare) is a roadmap item.
- The writer sees the full research bundle every call → repeated input tokens.
  Prompt caching would cut this substantially.
- TTS providers vary sharply in long-form support. The voice stage blocks known
  short-form models, rejects responses whose duration cannot contain the input
  words, and strips per-request MP3 metadata before joining frame streams.
