import { useEffect, useRef, useState, type RefObject } from "react";
import { z } from "zod";
import { renderGraph } from "../graph";
import { buildGraphModel } from "../graph-model";
import type { AnalysisDocument } from "../types";
import { attachLayoutLab, type LayoutLab as Controller } from "./layout-lab";
import {
  feedbackKey,
  LayoutFeedback,
  movedLabels,
  movedLinks,
  movedNodes,
} from "./layout-lab-model";

const ROUTE = "/__layout-lab";
const SaveResult = z.object({ path: z.string().optional(), error: z.string().optional() });

type LayoutLabProps = {
  host: RefObject<HTMLDivElement | null>;
  doc: AnalysisDocument;
  onExit: () => void;
};

const button =
  "h-9 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aizome";

/**
 * Renders the graph, then hands it to the drag canvas. The user's arrangement
 * is saved under the sentence so a reviewer can diff it against the renderer's.
 */
export default function LayoutLab({ host, doc, onExit }: LayoutLabProps) {
  const controller = useRef<Controller | null>(null);
  const [feedback, setFeedback] = useState<LayoutFeedback | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [handles, setHandles] = useState(false);
  const key = feedback ? feedbackKey(doc.input, feedback.viewport.compact) : null;

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    renderGraph(element, buildGraphModel(doc));
    const lab = attachLayoutLab(element, doc.input, setFeedback);
    controller.current = lab;
    const initial = lab.snapshot();
    let cancelled = false;
    void fetch(`${ROUTE}/entry?key=${encodeURIComponent(feedbackKey(doc.input, initial.viewport.compact))}`)
      .then(async (response) => (response.ok ? LayoutFeedback.safeParse(await response.json()) : null))
      .then((saved) => {
        if (cancelled || !saved?.success) {
          return;
        }
        lab.restore(saved.data);
        setNotes(saved.data.notes);
        setStatus(`Loaded the arrangement saved ${new Date(saved.data.savedAt).toLocaleString()}`);
      })
      .catch(() => setStatus("Could not reach the dev server to load a saved arrangement"));
    return () => {
      cancelled = true;
      lab.detach();
      controller.current = null;
    };
  }, [host, doc]);

  useEffect(() => {
    controller.current?.showHandles(handles);
  }, [handles, feedback]);

  async function save(): Promise<void> {
    const lab = controller.current;
    if (!lab || !key) {
      return;
    }
    setStatus("Saving…");
    try {
      const response = await fetch(`${ROUTE}/entry?key=${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...lab.snapshot(), notes }),
      });
      const result = SaveResult.parse(await response.json());
      setStatus(response.ok ? `Saved ${result.path}` : `Save failed: ${result.error}`);
    } catch {
      setStatus("Save failed: is the vite dev server running?");
    }
  }

  return (
    <aside
      aria-label="Layout lab"
      className="absolute top-3 right-3 z-10 flex w-[22rem] max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-xl border border-mist bg-white/95 p-3 text-sm shadow-lg backdrop-blur"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-aizome">Layout lab</h2>
        <span className="text-xs text-fog">drag nodes and labels</span>
      </header>
      <p className="truncate text-aizome" title={doc.input}>
        {doc.input}
      </p>
      {feedback && (
        <dl className="grid grid-cols-3 gap-2 text-center text-xs text-fog">
          <div>
            <dt>nodes moved</dt>
            <dd className="text-base font-semibold text-aizome" data-lab-moved-nodes>
              {movedNodes(feedback)}
            </dd>
          </div>
          <div>
            <dt>labels moved</dt>
            <dd className="text-base font-semibold text-aizome" data-lab-moved-labels>
              {movedLabels(feedback)}
            </dd>
          </div>
          <div>
            <dt>links bent</dt>
            <dd className="text-base font-semibold text-aizome" data-lab-moved-links>
              {movedLinks(feedback)}
            </dd>
          </div>
        </dl>
      )}
      <label className="flex items-center gap-2 text-xs text-fog">
        <input
          type="checkbox"
          checked={handles}
          onChange={(event) => setHandles(event.target.checked)}
          className="size-4 accent-aizome"
        />
        Show bend handles (amber dots slide along each link)
      </label>
      <textarea
        aria-label="Notes about this arrangement"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="What makes this arrangement right?"
        rows={2}
        className="w-full resize-y rounded-lg border border-mist px-2 py-1 text-sm text-aizome outline-none focus:border-aizome"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} className={`${button} bg-aizome text-white hover:bg-aizome-deep`}>
          Save to repo
        </button>
        <button
          type="button"
          onClick={() => controller.current?.reset()}
          className={`${button} border border-mist text-aizome hover:bg-washi`}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onExit}
          className={`${button} ml-auto border border-mist text-fog hover:bg-washi`}
        >
          Exit lab
        </button>
      </div>
      <p aria-live="polite" className="min-h-4 truncate text-xs text-fog" title={status}>
        {status}
      </p>
    </aside>
  );
}
