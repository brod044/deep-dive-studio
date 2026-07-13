# Roadmap

## Done
- [x] OpenRouter as a first-class provider (LLM, web search, TTS) with exact
      per-call cost accounting; Anthropic direct still supported
- [x] Web UI — local studio: commission desk, live run sheet + call telemetry
      (On Air), library with episode detail, cost ledger, settings, API key
      management, audio player, test-flight mock mode
- [x] Cost dashboard per episode (Ledger view + `meta.json` per episode)
- [x] Style guide v2 — Asianometry/SemiAnalysis-derived narration register;
      figure-dense research prompts

## v0.2 — reliability
- [ ] Resume: skip stages whose artifacts already exist on disk (`--resume`)
- [ ] Prompt caching on the research bundle across section calls
- [ ] `--section <id>` to regenerate a single section (style iteration)
- [ ] Structured retry with exponential backoff + rate-limit awareness

## v0.3 — research quality
- [ ] True source verification: fetch each cited URL, confirm the claim
- [ ] Source-quality tiers: primary docs > journalism > wikis > forums,
      with per-claim-type trust rules
- [ ] Configurable research depth (searches per angle, note count targets)
- [ ] Angle presets per domain (e.g. "consumer tech", "materials science")

## v0.4 — product
- [ ] Episode queue: paste 10 topics, wake up to 10 episodes
- [ ] RSS feed generation → personal private podcast feed any player can
      subscribe to (this is the killer feature for the listen-on-a-walk use)
- [ ] Style presets beyond the documentary voice

## Open questions
- Chapter markers in the MP3 (ID3 CHAP frames) for section navigation
- Multi-episode series on one mega-topic (e.g. "displays" → CRT episode,
  plasma episode, LCD episode...)
