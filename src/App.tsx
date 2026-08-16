import { useEffect, useRef, useState } from "react";
import { analyzeText } from "./app";
import { DictionaryCard } from "./dictionary-card";
import { renderGraph } from "./graph";
import { buildGraphModel } from "./graph-model";
import type { AnalysisDocument } from "./types";

const SEED_SENTENCE = "東京しか行かない";

export function App() {
  const [sentence, setSentence] = useState(SEED_SENTENCE);
  const [status, setStatus] = useState("");
  const [doc, setDoc] = useState<AnalysisDocument | null>(null);
  const graphHost = useRef<HTMLDivElement>(null);

  async function analyze(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setStatus("Analyzing…");
    try {
      const next = await analyzeText(trimmed);
      setDoc(next);
      setStatus(
        `${next.tokens.length} tokens · ${next.primary_matches.length} matches`,
      );
    } catch {
      // Preserve the current graph on failure — just report it.
      setStatus("Analysis failed — is the backend running?");
    }
  }

  // Seed with the classic example so the page isn't empty on load.
  useEffect(() => {
    void analyze(SEED_SENTENCE);
  }, []);

  // d3 owns everything inside the graph host; React never renders into it.
  useEffect(() => {
    if (doc && graphHost.current) {
      renderGraph(graphHost.current, buildGraphModel(doc));
    }
  }, [doc]);

  return (
    <div className="flex h-screen w-screen flex-col">
      <form
        className="flex gap-2 border-b border-mist bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void analyze(sentence);
        }}
      >
        <input
          type="text"
          value={sentence}
          onChange={(event) => setSentence(event.target.value)}
          placeholder="文を貼り付け… (e.g. 東京しか行かない)"
          className="flex-1 rounded border border-mist px-3 py-2 text-lg text-aizome outline-none focus:border-aizome"
        />
        <button
          type="submit"
          className="rounded bg-aizome px-4 py-2 font-medium text-white hover:bg-aizome-deep"
        >
          Analyze
        </button>
        <span className="self-center text-sm text-fog">{status}</span>
      </form>

      <div className="min-h-0 flex-1" ref={graphHost} />

      {doc && doc.primary_matches.length > 0 && (
        <section className="max-h-[40%] overflow-y-auto border-t border-mist p-4">
          <h2 className="mb-3 text-sm font-medium tracking-widest text-fog">
            DETECTED GRAMMAR
          </h2>
          <div className="flex flex-col gap-3">
            {doc.primary_matches.map((match) => (
              <DictionaryCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
