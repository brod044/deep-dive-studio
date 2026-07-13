# Deep Dive Studio

Type a topic. Get a ~30-minute, researched, fact-checked, single-narrator
documentary podcast script — history, technical breakdown, industry story,
reception, present-day community sentiment, and future — optionally rendered
to audio.

Built for the "I fell down a rabbit hole about TV display technology and wish
I could listen to a proper deep dive on it" problem. The narration register is
modeled on the best of the genre: Asianometry's date-and-dollar-anchored
industrial storytelling fused with SemiAnalysis's numbers-over-narrative
analytical discipline.

## Features

- **Web UI** — a local "broadcast console" studio: commission episodes from a
  text bar, watch the production run sheet and every model call live, browse
  your library with generated cover art, play rendered audio, and see exactly
  what each episode cost, per stage and per call.
- **Three-model pipeline** — a cheap model researches five angles in parallel
  with live web search, a mid-tier model cross-checks the claims and
  quarantines the weak ones, and a top-tier model writes the narration section
  by section under a strict documentary style guide.
- **Two providers** — bring an [OpenRouter](https://openrouter.ai) key and
  everything (research, search, fact-check, writing, even TTS) runs through
  one account with exact per-call cost reporting; or use an Anthropic key
  directly. ElevenLabs is supported for higher-end narration.
- **Test flight mode** — run the entire pipeline and UI with canned responses
  and zero spend, to try it before adding a key.
- **CLI** — everything also works headless for scripting and cron jobs.

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run ui          # → http://localhost:8787
```

Open the studio, go to **Settings → API keys**, paste an OpenRouter key (or
Anthropic key), and commission your first episode. Or flip on **TEST FLIGHT**
in the commission desk and try the whole flow for free first.

CLI equivalent:

```bash
cp .env.example .env   # add OPENROUTER_API_KEY or ANTHROPIC_API_KEY
npm run generate -- --topic "TV display technology, CRT to OLED" \
  --focus "the modern CRT revival, whether older tech beats newer" \
  --voice
```

Everything lands in `output/<topic-slug>/`: sourced research notes per angle,
the fact-check quarantine list (`flags.json`), the finished script
(`script.md` / `script.txt`), a cost ledger (`meta.json`), and `episode.mp3`
with `--voice`.

## Configuration

Keys and models can be set in the UI (Settings), via `.env`, or per run with
CLI flags. Precedence: CLI flags > env vars > per-provider defaults.

| Setting | Env var | Default |
| --- | --- | --- |
| LLM provider | `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` (`LLM_PROVIDER` to force) | OpenRouter if its key is set |
| Research model | `RESEARCH_MODEL` or `--research-model` | Claude Haiku 4.5 |
| Fact-check model | `FACTCHECK_MODEL` or `--factcheck-model` | Claude Sonnet 4.6 |
| Writer model | `WRITER_MODEL` or `--writer-model` | Claude Opus 4.8 |
| Voice provider | `VOICE_PROVIDER` | ElevenLabs if its key is set, else OpenRouter TTS |
| OpenRouter TTS | `TTS_MODEL`, `TTS_VOICE` | `openai/gpt-4o-mini-tts-2025-12-15`, `onyx` |

With OpenRouter, use vendor-prefixed slugs (`anthropic/claude-opus-4.8`); on
the direct Anthropic path use bare model ids (`claude-opus-4-8`).

## Cost expectations (rough, per episode)

Research is ~5 cheap-model calls with up to 10 web searches each; fact-check
is one mid-tier call; writing is 8 top-tier calls over a shared research
bundle. With default models an episode lands in the low single-digit dollars —
and the Ledger view shows the exact figure per episode, broken down by stage,
because OpenRouter reports true per-call cost.

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, and
[CLAUDE.md](CLAUDE.md) for project conventions and invariants if you're
working on this repo (with Claude Code or otherwise).

## License

[MIT](LICENSE)
