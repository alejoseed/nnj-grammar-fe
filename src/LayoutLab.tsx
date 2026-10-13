import { useEffect, useRef, useState, type RefObject } from "react";
import { z } from "zod";
import { submitLayout } from "./api";
import { renderGraph } from "./graph";
import { buildGraphModel } from "./graph-model";
import { attachLayoutLab, type LayoutLab as Controller } from "./layout-lab";
import {
  feedbackKey,
  LayoutFeedback,
  movedLabels,
  movedLinks,
  movedNodes,
} from "./layout-lab-model";
import {
  clearLayoutSettings,
  DEFAULT_LAYOUT,
  sameLayout,
  saveLayoutSettings,
  type LayoutSettings,
} from "./layout-settings";
import type { AnalysisDocument } from "./types";

const ROUTE = "/__layout-lab";
const SaveResult = z.object({ path: z.string().optional(), error: z.string().optional() });

const SUBMITTER_STORAGE_KEY = "nnj-grammar.submitter";
const Submitter = z.object({ classCode: z.string(), nickname: z.string() });
type Submitter = z.infer<typeof Submitter>;

function loadSubmitter(): Submitter {
  try {
    const saved = Submitter.safeParse(JSON.parse(localStorage.getItem(SUBMITTER_STORAGE_KEY) ?? "null"));
    return saved.success ? saved.data : { classCode: "", nickname: "" };
  } catch {
    return { classCode: "", nickname: "" };
  }
}

function saveSubmitter(submitter: Submitter): void {
  try {
    localStorage.setItem(SUBMITTER_STORAGE_KEY, JSON.stringify(submitter));
  } catch {
  }
}

type LayoutLabProps = {
  host: RefObject<HTMLDivElement | null>;
  doc: AnalysisDocument;
  settings: LayoutSettings;
  onSettingsChange: (settings: LayoutSettings) => void;
  onExit: () => void;
};

const button =
  "h-8 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aizome";
const primaryButton = `${button} bg-aizome text-white hover:bg-aizome-deep`;
const quietButton = `${button} border border-mist text-aizome hover:bg-washi`;

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, onChange }: SliderProps) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-xs text-fog">
      <span>{label}</span>
      <span className="tabular-nums text-aizome">{value}px</span>
      <input
        type="range"
        min={min}
        max={max}
        step={2}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="col-span-2 accent-aizome"
      />
    </label>
  );
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}


export default function LayoutLab({ host, doc, settings, onSettingsChange, onExit }: LayoutLabProps) {
  const controller = useRef<Controller | null>(null);
  const lastArrangement = useRef<LayoutFeedback | null>(null);
  const renderedFor = useRef<{ sentence: string; settings: LayoutSettings } | null>(null);
  const [feedback, setFeedback] = useState<LayoutFeedback | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [handles, setHandles] = useState(false);
  const [submitter, setSubmitter] = useState(loadSubmitter);
  const [sending, setSending] = useState(false);
  const key = feedback ? feedbackKey(doc.input, feedback.viewport.compact) : null;

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const previous = renderedFor.current;
    const carried =
      previous && previous.sentence === doc.input && !sameLayout(previous.settings, settings)
        ? lastArrangement.current
        : null;
    renderedFor.current = { sentence: doc.input, settings };
    renderGraph(element, buildGraphModel(doc), undefined, settings);
    const lab = attachLayoutLab(element, doc.input, (snapshot) => {
      lastArrangement.current = snapshot;
      setFeedback(snapshot);
    });
    controller.current = lab;
    let cancelled = false;
    if (carried) {
      lab.restore(carried, "relative");
    } else {
      const initial = lab.snapshot();
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
        .catch(() => {
        });
    }
    return () => {
      cancelled = true;
      lab.detach();
      controller.current = null;
    };
  }, [host, doc, settings]);

  useEffect(() => {
    controller.current?.showHandles(handles);
  }, [handles, feedback]);

  function arrangement(): LayoutFeedback | null {
    const lab = controller.current;
    return lab ? { ...lab.snapshot(), notes, settings } : null;
  }

  async function saveToRepo(): Promise<void> {
    const current = arrangement();
    if (!current || !key) {
      return;
    }
    setStatus("Saving…");
    try {
      const response = await fetch(`${ROUTE}/entry?key=${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(current, null, 2),
      });
      const result = SaveResult.safeParse(await response.json());
      if (response.ok && result.success && result.data.path) {
        setStatus(`Saved ${result.data.path}`);
        return;
      }
      setStatus(`Save failed: ${result.success && result.data.error ? result.data.error : response.status}`);
    } catch {
      setStatus("Save failed: the dev server did not answer");
    }
  }

  async function sendToTeacher(): Promise<void> {
    const current = arrangement();
    if (!current || !key) {
      return;
    }
    if (submitter.classCode.trim() === "") {
      setStatus("Enter the class code from the board first");
      return;
    }
    saveSubmitter(submitter);
    setSending(true);
    setStatus("Sending…");
    const result = await submitLayout(submitter.classCode, submitter.nickname, current);
    setSending(false);
    if (result.kind === "sent") {
      setStatus(`Sent. Thank you! (#${result.id})`);
    } else if (result.kind === "refused") {
      setStatus(result.message);
    } else {
      download(`${key}.json`, JSON.stringify(current, null, 2));
      setStatus(`The server could not take it, so ${key}.json downloaded. Send it directly to me at alejandrojpalmar@hotmail.com.`);
    }
  }

  const changeSetting = <K extends keyof LayoutSettings>(name: K, value: LayoutSettings[K]) =>
    onSettingsChange({ ...settings, [name]: value });

  return (
    <aside
      aria-label="Layout"
      className="absolute top-3 right-3 z-10 flex w-[21rem] max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-xl border border-mist bg-white/95 p-3 text-sm shadow-lg backdrop-blur"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-aizome">Layout</h2>
        <button type="button" onClick={onExit} className={`${quietButton} text-fog`}>
          Exit
        </button>
      </header>

      <section aria-labelledby="layout-spacing" className="flex flex-col gap-2">
        <h3 id="layout-spacing" className="text-xs font-semibold tracking-wider text-fog uppercase">
          Spacing
        </h3>
        <Slider
          label="Between labels"
          value={settings.rowClearancePx}
          min={0}
          max={60}
          onChange={(value) => changeSetting("rowClearancePx", value)}
        />
        <Slider
          label="Between bunsetsu groups"
          value={settings.groupGapPx}
          min={0}
          max={120}
          onChange={(value) => changeSetting("groupGapPx", value)}
        />
        <Slider
          label="Parent to children"
          value={settings.columnGapPx}
          min={40}
          max={320}
          onChange={(value) => changeSetting("columnGapPx", value)}
        />
        <label className="flex items-center gap-2 text-xs text-fog">
          <input
            type="checkbox"
            checked={settings.fitToFrame}
            onChange={(event) => changeSetting("fitToFrame", event.target.checked)}
            className="size-4 accent-aizome"
          />
          Fit the whole tree on screen
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setStatus(
                saveLayoutSettings(settings)
                  ? "Saved as your default spacing in this browser"
                  : "This browser does not allow saving a preset",
              );
            }}
            className={primaryButton}
          >
            Save as my default
          </button>
          <button
            type="button"
            disabled={sameLayout(settings, DEFAULT_LAYOUT)}
            onClick={() => {
              clearLayoutSettings();
              onSettingsChange(DEFAULT_LAYOUT);
              setStatus("Back to the standard spacing");
            }}
            className={`${quietButton} disabled:opacity-40`}
          >
            Use standard
          </button>
        </div>
      </section>

      <section aria-labelledby="layout-arrangement" className="flex flex-col gap-2 border-t border-mist pt-3">
        <h3 id="layout-arrangement" className="text-xs font-semibold tracking-wider text-fog uppercase">
          Arrangement
        </h3>
        <p className="text-xs text-fog">Drag any node or label to where it reads best.</p>
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
          Show bend handles
        </label>
        <textarea
          aria-label="Notes about this arrangement"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Why is this arrangement better?"
          rows={2}
          className="w-full resize-y rounded-lg border border-mist px-2 py-1 text-sm text-aizome outline-none focus:border-aizome"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-fog">
            Class code
            <input
              value={submitter.classCode}
              onChange={(event) => setSubmitter({ ...submitter, classCode: event.target.value })}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              className="h-8 rounded-lg border border-mist px-2 text-sm text-aizome uppercase outline-none focus:border-aizome"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fog">
            Nickname (optional)
            <input
              value={submitter.nickname}
              onChange={(event) => setSubmitter({ ...submitter, nickname: event.target.value })}
              autoComplete="nickname"
              maxLength={40}
              className="h-8 rounded-lg border border-mist px-2 text-sm text-aizome outline-none focus:border-aizome"
            />
          </label>
        </div>
        <p className="text-xs text-fog">
          This browser keeps an anonymous id so your arrangements stay together.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendToTeacher()}
            className={`${primaryButton} disabled:opacity-40`}
          >
            Send to Alejandro
          </button>
          <button type="button" onClick={() => controller.current?.reset()} className={quietButton}>
            Reset
          </button>
          {import.meta.env.DEV && (
            <button type="button" onClick={() => void saveToRepo()} className={quietButton}>
              Save to repo
            </button>
          )}
        </div>
      </section>
      <p aria-live="polite" className="min-h-4 truncate text-xs text-fog" title={status}>
        {status}
      </p>
    </aside>
  );
}
