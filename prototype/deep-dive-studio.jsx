import { useState, useEffect, useRef } from "react";

// ————————————————————————————————————————————————
// DEEP DIVE STUDIO
// Topic → multi-angle web research → fact-check → longform
// documentary script in an Asianometry-style structure.
// Two materials: a dark "console" (the pipeline) and a
// "paper" document (the finished script).
// ————————————————————————————————————————————————

const C = {
  bakelite: "#1C1A16", // console background
  panel: "#26231D", // raised console panel
  hairline: "#3A362D",
  paperText: "#EDE6D3",
  dim: "#9C9484",
  amber: "#E8A33D", // phosphor amber — active / accent
  amberDim: "#8A6524",
  teal: "#6FB3A8", // verified / done
  red: "#C4553B", // flagged / error
  paper: "#F1EADA", // script document
  ink: "#25221B",
  inkSoft: "#5C564A",
};

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Bitter:wght@700;900&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap";

// ————————————————— research angles —————————————————
const ANGLES = [
  {
    id: "history",
    label: "Field research · History",
    prompt: (topic) =>
      `You are a research assistant for a longform tech-history documentary about: ${topic}.
Use web search (multiple searches). Compile dense CHRONOLOGICAL research notes on the invention and evolution of this topic: key innovations, exact years, where each was discovered/developed, the people and labs behind them, and how each generation displaced the last.
Rules: one fact per line, start each line with "- ". Every line must end with the source URL in parentheses. Prefer specific numbers, dates, names over generalities. No intro or outro text — notes only.`,
  },
  {
    id: "technical",
    label: "Field research · Technical",
    prompt: (topic) =>
      `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search. Compile research notes on HOW the major variants/technologies within this topic physically work: underlying physics/engineering, manufacturing process, why each approach has its characteristic strengths and weaknesses, and honest trade-offs between older and newer approaches (including any real advantages older tech retains).
Rules: one fact per line, start each line with "- ". Every line must end with the source URL in parentheses. Be precise and technical. Notes only.`,
  },
  {
    id: "industry",
    label: "Field research · Industry & players",
    prompt: (topic) =>
      `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search. Compile research notes on the INDUSTRY: the major companies past and present, national/regional manufacturing shifts, market share and pricing trends, famous marketing campaigns and format wars, and notable business failures or exits.
Rules: one fact per line, start each line with "- ". Every line must end with the source URL in parentheses. Prefer named companies, dollar figures, and dates. Notes only.`,
  },
  {
    id: "sentiment",
    label: "Field research · Sentiment & culture",
    prompt: (topic) =>
      `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search, including enthusiast forums, Reddit, and recent articles. Compile research notes on SENTIMENT: how people felt about each technology at the time (hype, controversies, complaints), and how communities feel TODAY — revival/retro movements, collector culture, common current complaints and enthusiasms, and any generational dynamics.
Rules: one observation per line, start each line with "- ". Attribute clearly (e.g. "r/crtgaming users commonly argue..."). Every line must end with the source URL in parentheses. Clearly mark opinions as opinions. Notes only.`,
  },
  {
    id: "future",
    label: "Field research · The future",
    prompt: (topic) =>
      `You are a research assistant for a longform tech documentary about: ${topic}.
Use web search for RECENT news. Compile research notes on THE FUTURE: emerging technologies and research directions, where R&D money is flowing, which companies and countries are leading, credible roadmaps and timelines, and expert skepticism about any of it.
Rules: one fact per line, start each line with "- ". Every line must end with the source URL in parentheses. Prefer developments from the last 2 years. Notes only.`,
  },
];

// ————————————————— script structure —————————————————
const STYLE_GUIDE = `VOICE & STYLE (follow strictly):
- Single narrator, written to be READ ALOUD. No headers, no bullet points, no citations in the text — flowing spoken prose only.
- Dry, understated, precise. The register of a good industrial-history documentary: specific over vague, numbers and names over adjectives.
- Short declarative sentences. Vary rhythm. The occasional wry, deadpan aside is welcome; enthusiasm is expressed through specificity, never hype words ("revolutionary", "game-changing", "delve" are banned).
- Ground every claim in the research notes provided. If the notes don't support a claim, do not make it. Never invent statistics, quotes, or dates.
- Attribute sentiment honestly ("forum users often argue...", "reviewers at the time complained...").
- Assume an intelligent listener who knows nothing about this specific topic. Explain technical concepts from first principles, briefly and concretely, using physical analogies where they genuinely clarify.`;

const SECTIONS = [
  {
    id: "cold-open",
    label: "Cold open",
    brief:
      "A 250–400 word cold open. Start with one concrete, surprising scene, fact, or tension from the research — not a definition. Establish why this topic is worth 30 minutes. End by laying out, in one or two sentences, the journey the episode will take. Finish with a simple spoken title card line for the episode.",
  },
  {
    id: "origins",
    label: "Part 1 · Origins",
    brief:
      "600–750 words. The chronological early history: the founding inventions, where and when they happened, the people and labs involved, and the first commercialization. Rely primarily on the HISTORY notes.",
  },
  {
    id: "how-it-works",
    label: "Part 2 · How it works",
    brief:
      "600–750 words. The technical breakdown: explain how each major variant of the technology physically works, in chronological order of the technologies, and why each has its characteristic strengths and flaws. Rely primarily on the TECHNICAL notes. This is the most technical section — keep it concrete and physical.",
  },
  {
    id: "industry",
    label: "Part 3 · The industry",
    brief:
      "600–750 words. The business story: the major companies, the manufacturing geography and how it shifted, the marketing battles and format wars, prices falling over time, who won and who died. Rely primarily on the INDUSTRY notes.",
  },
  {
    id: "reception",
    label: "Part 4 · Reception & controversy",
    brief:
      "500–650 words. How people felt at the time: the hype, the complaints, the controversies, the transitions consumers resisted or embraced. Rely primarily on the SENTIMENT notes (the historical portions).",
  },
  {
    id: "today",
    label: "Part 5 · The present",
    brief:
      "550–700 words. The current state: today's market and dominant players, current pricing dynamics, and — importantly — modern community sentiment: revival and retro movements, collector culture, what enthusiasts argue about now, and any genuine advantages older technology retains. Rely on the SENTIMENT and INDUSTRY notes.",
  },
  {
    id: "future",
    label: "Part 6 · The future",
    brief:
      "500–650 words. Where it's going: the emerging technologies, where the R&D money is, which companies and countries are pushing hardest, realistic timelines, and honest skepticism. Rely primarily on the FUTURE notes.",
  },
  {
    id: "closing",
    label: "Closing",
    brief:
      "250–350 words. A synthesis, not a summary: one clear-eyed observation about what this topic's arc says about technology, markets, or people. End dry and slightly abrupt, documentary style. No 'thanks for listening' filler.",
  },
];

// ————————————————— API helper —————————————————
async function callClaude(userContent, { useSearch = false } = {}) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: userContent }],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "API error");
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("Empty model response");
      return text;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

// ————————————————— UI atoms —————————————————
function Lamp({ status }) {
  const color =
    status === "running" ? C.amber : status === "done" ? C.teal : status === "error" ? C.red : C.hairline;
  return (
    <span
      className="inline-block flex-shrink-0"
      style={{
        width: 9,
        height: 9,
        background: color,
        boxShadow: status === "running" ? `0 0 8px ${C.amber}` : "none",
        animation: status === "running" ? "ddPulse 1.2s ease-in-out infinite" : "none",
      }}
    />
  );
}

function StageRow({ stage }) {
  return (
    <div
      className="flex items-center gap-3 py-2 px-3"
      style={{ borderBottom: `1px solid ${C.hairline}` }}
    >
      <Lamp status={stage.status} />
      <span
        className="flex-1 text-xs"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          color: stage.status === "idle" ? C.dim : C.paperText,
        }}
      >
        {stage.label}
      </span>
      <span
        className="text-xs"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          color:
            stage.status === "done" ? C.teal : stage.status === "error" ? C.red : stage.status === "running" ? C.amber : C.dim,
        }}
      >
        {stage.status === "idle" && "standby"}
        {stage.status === "running" && "running"}
        {stage.status === "done" && stage.detail}
        {stage.status === "error" && "failed"}
      </span>
    </div>
  );
}

// ————————————————— main —————————————————
export default function DeepDiveStudio() {
  const [topic, setTopic] = useState("");
  const [focus, setFocus] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | running | done | error
  const [stages, setStages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [script, setScript] = useState([]); // [{id,label,text}]
  const [errMsg, setErrMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const logEnd = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_HREF;
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `@keyframes ddPulse {0%,100%{opacity:1}50%{opacity:.35}}
      @media (prefers-reduced-motion: reduce){ *{animation:none !important} }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs]);

  const log = (line) =>
    setLogs((l) => [...l, { t: new Date().toLocaleTimeString([], { hour12: false }), line }]);

  const setStage = (id, patch) =>
    setStages((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));

  async function run() {
    if (!topic.trim()) return;
    setPhase("running");
    setScript([]);
    setLogs([]);
    setErrMsg("");
    setCopied(false);

    const initialStages = [
      ...ANGLES.map((a) => ({ id: a.id, label: a.label, status: "idle", detail: "" })),
      { id: "verify", label: "Verification desk · Fact-check pass", status: "idle", detail: "" },
      ...SECTIONS.map((s) => ({ id: "w-" + s.id, label: "Script desk · " + s.label, status: "idle", detail: "" })),
    ];
    setStages(initialStages);
    log(`Commissioned: "${topic.trim()}"`);

    try {
      // ——— Stage 1: parallel research ———
      log("Dispatching 5 researchers with live web search…");
      const notes = {};
      await Promise.all(
        ANGLES.map(async (a) => {
          setStage(a.id, { status: "running" });
          const fullTopic = focus.trim() ? `${topic.trim()} (listener notes: ${focus.trim()})` : topic.trim();
          const text = await callClaude(a.prompt(fullTopic), { useSearch: true });
          notes[a.id] = text;
          const lines = text.split("\n").filter((l) => l.trim().startsWith("-")).length;
          setStage(a.id, { status: "done", detail: `${lines} notes` });
          log(`${a.label}: ${lines} sourced notes filed.`);
        })
      );

      // ——— Stage 2: fact-check ———
      setStage("verify", { status: "running" });
      log("Cross-checking claims across all research files…");
      let flags = [];
      try {
        const verifyOut = await callClaude(
          `You are the fact-check desk for a documentary about: ${topic.trim()}.
Below are five research files. Identify claims that are (a) contradicted by another file, (b) implausible on their face, or (c) stated as fact but lacking a credible source. Respond ONLY with JSON, no markdown fences, in the shape {"flags":[{"claim":"short quote of the claim","reason":"why it is suspect"}]}. If nothing is suspect, return {"flags":[]}.

${ANGLES.map((a) => `=== ${a.id.toUpperCase()} FILE ===\n${notes[a.id]}`).join("\n\n")}`
        );
        const clean = verifyOut.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
        flags = Array.isArray(parsed.flags) ? parsed.flags : [];
      } catch (e) {
        log("Fact-check output unparseable — proceeding without flags.");
      }
      setStage("verify", { status: "done", detail: `${flags.length} flagged` });
      log(
        flags.length
          ? `${flags.length} claim(s) flagged and quarantined: ${flags.map((f) => `"${f.claim}"`).join("; ")}`
          : "No suspect claims found."
      );

      // ——— Stage 3: sequential script writing ———
      const researchBundle = ANGLES.map(
        (a) => `=== ${a.id.toUpperCase()} NOTES ===\n${notes[a.id]}`
      ).join("\n\n");
      const flagText = flags.length
        ? `\nQUARANTINED CLAIMS — do NOT use these in the script:\n${flags
            .map((f) => `- ${f.claim} (${f.reason})`)
            .join("\n")}`
        : "";

      const written = [];
      for (const sec of SECTIONS) {
        setStage("w-" + sec.id, { status: "running" });
        log(`Writing: ${sec.label}…`);
        const prevTail = written.length
          ? `\nFor continuity, the previous section ended with:\n"…${written[written.length - 1].text.split(/\s+/).slice(-90).join(" ")}"`
          : "";
        const text = await callClaude(
          `You are the scriptwriter for a longform audio documentary episode about: ${topic.trim()}.
${focus.trim() ? `The listener specifically asked to cover: ${focus.trim()}\n` : ""}
${STYLE_GUIDE}

SECTION TO WRITE NOW — ${sec.label}:
${sec.brief}
${prevTail}

Output ONLY the narration text for this section. No headers, no labels, no notes.
${flagText}

RESEARCH FILES:
${researchBundle}`
        );
        written.push({ id: sec.id, label: sec.label, text });
        setScript([...written]);
        const w = text.split(/\s+/).length;
        setStage("w-" + sec.id, { status: "done", detail: `${w} words` });
        log(`${sec.label}: ${w} words on the page.`);
      }

      const totalWords = written.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
      log(`Episode complete — ${totalWords} words, ≈${Math.round(totalWords / 150)} minute runtime.`);
      setPhase("done");
    } catch (e) {
      setErrMsg(e.message || String(e));
      setStages((s) => s.map((st) => (st.status === "running" ? { ...st, status: "error" } : st)));
      log(`PIPELINE HALT — ${e.message || e}`);
      setPhase("error");
    }
  }

  const fullScript = script
    .map((s) => `${s.label.toUpperCase()}\n\n${s.text}`)
    .join("\n\n\n");
  const totalWords = script.reduce((n, s) => n + s.text.split(/\s+/).length, 0);

  function copyScript() {
    navigator.clipboard.writeText(fullScript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadScript() {
    const blob = new Blob([fullScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + "-script.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const running = phase === "running";

  return (
    <div style={{ background: C.bakelite, minHeight: "100vh", color: C.paperText, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-10">
        {/* masthead */}
        <div style={{ borderBottom: `3px solid ${C.amber}` }} className="pb-4">
          <div
            className="text-xs tracking-widest"
            style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.amber }}
          >
            AUTOMATED RESEARCH DOCUMENTARY · EPISODE PIPELINE
          </div>
          <h1
            className="mt-1 text-4xl"
            style={{ fontFamily: "'Bitter', serif", fontWeight: 900, color: C.paperText, letterSpacing: "-0.01em" }}
          >
            Deep Dive Studio
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.dim, maxWidth: "46ch" }}>
            Name a topic. Five researchers fan out across the web, a fact-check desk quarantines weak claims, and a
            scriptwriter files a ~30-minute documentary you can hand to any voice model.
          </p>
        </div>

        {/* commission form */}
        <div className="mt-8">
          <label className="block text-xs tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.dim }}>
            EPISODE TOPIC
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={running}
            placeholder="TV display technology — CRT to OLED and beyond"
            className="mt-2 w-full px-3 py-3 text-base outline-none"
            style={{
              background: C.panel,
              border: `1px solid ${C.hairline}`,
              color: C.paperText,
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          />
          <label className="mt-4 block text-xs tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.dim }}>
            ANGLES YOU CARE ABOUT · OPTIONAL
          </label>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            disabled={running}
            placeholder="the modern CRT revival, whether older tech beats newer, TCL and Hisense"
            className="mt-2 w-full px-3 py-3 text-sm outline-none"
            style={{
              background: C.panel,
              border: `1px solid ${C.hairline}`,
              color: C.paperText,
            }}
          />
          <button
            onClick={run}
            disabled={running || !topic.trim()}
            className="mt-5 w-full px-4 py-3 text-sm tracking-widest"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              background: running || !topic.trim() ? C.panel : C.amber,
              color: running || !topic.trim() ? C.dim : C.bakelite,
              border: `1px solid ${running || !topic.trim() ? C.hairline : C.amber}`,
              cursor: running || !topic.trim() ? "default" : "pointer",
              fontWeight: 500,
            }}
          >
            {running ? "PRODUCTION IN PROGRESS…" : "COMMISSION EPISODE"}
          </button>
          <p className="mt-2 text-xs" style={{ color: C.dim }}>
            A full run makes ~14 model calls and takes several minutes. Sections appear below as they're written.
          </p>
        </div>

        {/* run sheet */}
        {stages.length > 0 && (
          <div className="mt-10">
            <div className="text-xs tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.amber }}>
              PRODUCTION RUN SHEET
            </div>
            <div className="mt-2" style={{ background: C.panel, border: `1px solid ${C.hairline}` }}>
              {stages.map((st) => (
                <StageRow key={st.id} stage={st} />
              ))}
            </div>

            {/* wire log */}
            <div
              className="mt-3 max-h-40 overflow-y-auto px-3 py-2 text-xs leading-relaxed"
              style={{
                background: C.panel,
                border: `1px solid ${C.hairline}`,
                fontFamily: "'IBM Plex Mono', monospace",
                color: C.dim,
              }}
            >
              {logs.map((l, i) => (
                <div key={i}>
                  <span style={{ color: C.amberDim }}>{l.t}</span> {l.line}
                </div>
              ))}
              <div ref={logEnd} />
            </div>
            {phase === "error" && (
              <div className="mt-3 px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.red}`, color: C.red }}>
                Pipeline halted: {errMsg}. Check your connection and commission the episode again — research is re-run fresh.
              </div>
            )}
          </div>
        )}

        {/* the script — paper document */}
        {script.length > 0 && (
          <div className="mt-12">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="text-xs tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.amber }}>
                EPISODE SCRIPT{phase === "done" ? ` · ${totalWords} WORDS · ≈${Math.round(totalWords / 150)} MIN READ-ALOUD` : " · FILING…"}
              </div>
              {phase === "done" && (
                <div className="flex gap-2">
                  <button
                    onClick={copyScript}
                    className="px-3 py-1.5 text-xs tracking-wider"
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      background: "transparent",
                      color: C.amber,
                      border: `1px solid ${C.amber}`,
                      cursor: "pointer",
                    }}
                  >
                    {copied ? "COPIED" : "COPY SCRIPT"}
                  </button>
                  <button
                    onClick={downloadScript}
                    className="px-3 py-1.5 text-xs tracking-wider"
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      background: "transparent",
                      color: C.amber,
                      border: `1px solid ${C.amber}`,
                      cursor: "pointer",
                    }}
                  >
                    DOWNLOAD .TXT
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 px-6 py-8 sm:px-10" style={{ background: C.paper, color: C.ink }}>
              <div
                className="text-xs tracking-widest"
                style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.inkSoft }}
              >
                DEEP DIVE STUDIO · NARRATION COPY
              </div>
              <div
                className="mt-1 text-2xl"
                style={{ fontFamily: "'Bitter', serif", fontWeight: 900 }}
              >
                {topic.trim()}
              </div>
              {script.map((s) => (
                <div key={s.id} className="mt-8">
                  <div
                    className="text-xs tracking-widest pb-1"
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: C.inkSoft,
                      borderBottom: `1px solid ${C.ink}22`,
                    }}
                  >
                    {s.label.toUpperCase()}
                  </div>
                  {s.text.split(/\n\n+/).map((p, i) => (
                    <p key={i} className="mt-4 text-[15px] leading-7" style={{ color: C.ink }}>
                      {p}
                    </p>
                  ))}
                </div>
              ))}
              {running && (
                <div className="mt-8 text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.inkSoft }}>
                  — next section being written —
                </div>
              )}
            </div>
            {phase === "done" && (
              <p className="mt-3 text-xs" style={{ color: C.dim }}>
                Hand this script to a single-narrator voice — ElevenLabs, or any TTS with a measured, dry read — for the
                finished episode.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
