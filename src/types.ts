export interface Angle {
  id: string;
  label: string;
  prompt: (topic: string) => string;
}

export interface Section {
  id: string;
  label: string;
  brief: string;
}

export interface ResearchFile {
  angleId: string;
  label: string;
  notes: string; // "- fact (url)" lines
}

export interface Flag {
  claim: string;
  reason: string;
}

export interface WrittenSection {
  id: string;
  label: string;
  text: string;
  words: number;
}

export interface EpisodeRequest {
  topic: string;
  focus?: string;
}

export interface Episode {
  request: EpisodeRequest;
  research: ResearchFile[];
  flags: Flag[];
  sections: WrittenSection[];
  totalWords: number;
  estMinutes: number;
}

/** Persisted as output/<slug>/meta.json; the UI's listing + cost analysis source. */
export interface EpisodeMeta {
  slug: string;
  topic: string;
  focus: string | null;
  createdAt: string;
  status: "running" | "done" | "error";
  error: string | null;
  provider: string;
  models: { research: string; factcheck: string; writer: string };
  voice: boolean;
  totalWords: number;
  estMinutes: number;
  flagsCount: number;
  calls: import("./telemetry.js").CallEvent[];
  cost: { total: number; byStage: Record<string, number> };
}
