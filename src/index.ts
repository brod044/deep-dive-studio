import { CONFIG } from "./config.js";
import { produceEpisode, log } from "./pipeline.js";

function parseArgs(argv: string[]): {
  topic?: string;
  focus?: string;
  voice: boolean;
  outDir: string;
  researchModel?: string;
  factcheckModel?: string;
  writerModel?: string;
} {
  const out = { voice: false, outDir: "output" } as {
    topic?: string;
    focus?: string;
    voice: boolean;
    outDir: string;
    researchModel?: string;
    factcheckModel?: string;
    writerModel?: string;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--topic") out.topic = argv[++i];
    else if (a === "--focus") out.focus = argv[++i];
    else if (a === "--voice") out.voice = true;
    else if (a === "--out") out.outDir = argv[++i];
    else if (a === "--research-model") out.researchModel = argv[++i];
    else if (a === "--factcheck-model") out.factcheckModel = argv[++i];
    else if (a === "--writer-model") out.writerModel = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.topic) {
  console.error(
    'Usage: npm run generate -- --topic "TV display technology" [--focus "..."] [--voice] [--out dir]\n' +
      "       [--research-model <id>] [--factcheck-model <id>] [--writer-model <id>]"
  );
  process.exit(1);
}

// CLI flags outrank env vars and provider defaults.
if (args.researchModel) CONFIG.models.research = args.researchModel;
if (args.factcheckModel) CONFIG.models.factcheck = args.factcheckModel;
if (args.writerModel) CONFIG.models.writer = args.writerModel;

log(
  `Provider: ${CONFIG.provider} — research=${CONFIG.models.research}, ` +
    `factcheck=${CONFIG.models.factcheck}, writer=${CONFIG.models.writer}`
);

produceEpisode(
  { topic: args.topic, focus: args.focus },
  { voice: args.voice, outDir: args.outDir }
).catch((err) => {
  log(`PIPELINE HALT — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
