import { useEffect, useRef, useState } from "react";
import { analyzeText } from "./app";
import { DictionaryCard } from "./dictionary-card";
import { renderGraph } from "./graph";
import { buildGraphModel } from "./graph-model";
import type { AnalysisDocument } from "./types";
import PhraseBank from "./phrase-bank";

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

  useEffect(() => {
    void analyze(SEED_SENTENCE);
  }, []);

  useEffect(() => {
    if (doc && graphHost.current) {
      renderGraph(graphHost.current, buildGraphModel(doc));
    }
  }, [doc]);

  const changePhrase = (newPhrase: string) => {
    setSentence(newPhrase);
    void analyze(newPhrase);
  };

  const resetGraphView = () => {
    if (doc && graphHost.current) {
      renderGraph(graphHost.current, buildGraphModel(doc));
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col">
      <form
        className="flex flex-wrap gap-2 border-b border-mist bg-white p-2.5 sm:flex-nowrap sm:p-3"
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
          className="h-11 w-full min-w-0 rounded-lg border border-mist px-3 text-base text-aizome outline-none focus:border-aizome sm:w-auto sm:flex-1 sm:text-lg"
        />
        <PhraseBank onSelect={changePhrase} />
        <button
          type="submit"
          className="h-11 rounded-lg bg-aizome px-4 font-medium text-white transition-colors hover:bg-aizome-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aizome"
        >
          Analyze
        </button>
        <span
          aria-live="polite"
          title={status}
          className="min-w-0 flex-1 self-center truncate text-right text-xs text-fog sm:flex-none sm:text-left sm:text-sm"
        >
          {status}
        </span>
      </form>

      <div
        className={`grid min-h-0 flex-1 grid-cols-1 ${
          doc && doc.primary_matches.length > 0
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]"
            : ""
        }`}
      >
        <div className="relative h-full min-h-0 min-w-0">
          <div className="h-full min-h-0 min-w-0" ref={graphHost} />
          {doc && (
            <button
              type="button"
              aria-label="Reset graph view"
              onClick={resetGraphView}
              className="absolute top-3 right-3 z-10 inline-flex h-10 items-center gap-2 rounded-full border border-mist bg-white/90 px-3 text-sm font-medium text-aizome shadow-sm backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aizome"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
              </svg>
              <span className="hidden sm:inline">Reset view</span>
            </button>
          )}
        </div>

        {doc && doc.primary_matches.length > 0 && (
          <section className="hidden min-h-0 overflow-y-auto border-l border-mist p-4 lg:block">
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
    </div>
  );
}
