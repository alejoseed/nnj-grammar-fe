import { useEffect, useId, useRef, useState } from "react";

type PhraseBankProps = {
  onSelect: (phrase: string) => void;
};

const LEVELS = ["n5", "n4", "n3", "n2", "n1"] as const;
type Level = (typeof LEVELS)[number];

const PHRASES: Record<Level, readonly string[]> = {
  n5: [
    "東京しか行かない",
    "毎朝コーヒーを飲んでから学校に行きます",
    "日本語はまだ上手じゃないから、ゆっくり話してください",
  ],
  n4: [
    "宿題を家に忘れてしまって、先生に説明していただけませんかと頼んだ",
    "先生が本を貸してくれたので、読んでみることにしました",
    "雨が降りそうだから、傘を買っておいたほうがいいよ",
  ],
  n3: [
    "電車が遅れたせいで、会議に間に合わなかった",
    "彼は文句ばかり言っている",
    "この機能に関しては、初心者にとって使いやすいはずだ",
    "会社によって、面接のやり方がまったく違う"
  ],
  n2: [
    "一度読んだだけでは、この文法は身につかない",
    "天気が良ければ良いほど、観光客が増える一方だ",
    "彼の説明は分かりにくいどころか、間違いだらけだった",
  ],
  n1: ["日本語を勉強し始めたが最後、やめられなくなった"],
};

export default function PhraseBank({ onSelect }: PhraseBankProps) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>("n5");
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function selectPhrase(phrase: string) {
    setOpen(false);
    onSelect(phrase);
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-mist bg-white px-3 font-medium whitespace-nowrap text-aizome transition-colors hover:bg-washi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aizome"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 21.5z" />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v18a2 2 0 0 1 2-2h2.5a2.5 2.5 0 0 1 2.5 2.5z" />
        </svg>
        Try an example
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close examples"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-sumi/25 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
          />
          <section
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${panelId}-title`}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(78dvh,38rem)] flex-col rounded-t-2xl border border-mist bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:top-[calc(100%+0.5rem)] sm:right-0 sm:bottom-auto sm:max-h-[min(70vh,36rem)] sm:w-[30rem] sm:rounded-xl"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-mist sm:hidden" />
            <header className="flex items-start justify-between gap-4 px-4 pt-4 pb-3 sm:px-5">
              <div>
                <h2
                  id={`${panelId}-title`}
                  className="font-semibold text-aizome"
                >
                  Try an example
                </h2>
                <p className="mt-0.5 text-sm text-fog">
                  Pick a sentence to see how the grammar graph works.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close examples"
                onClick={() => setOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-full text-fog transition-colors hover:bg-washi hover:text-aizome focus-visible:outline-2 focus-visible:outline-aizome"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </header>

            <div
              className="flex gap-1 overflow-x-auto border-y border-mist bg-washi/70 px-4 py-2 sm:px-5"
              aria-label="JLPT level"
            >
              {LEVELS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={level === candidate}
                  onClick={() => setLevel(candidate)}
                  className={`min-w-12 rounded-full px-3 py-1.5 text-sm font-semibold uppercase transition-colors ${
                    level === candidate
                      ? "bg-aizome text-white"
                      : "text-fog hover:bg-white hover:text-aizome"
                  }`}
                >
                  {candidate}
                </button>
              ))}
            </div>

            <ul className="overflow-y-auto p-2 sm:p-3">
              {PHRASES[level].map((phrase) => (
                <li key={phrase}>
                  <button
                    type="button"
                    onClick={() => selectPhrase(phrase)}
                    className="w-full rounded-lg px-3 py-3 text-left leading-relaxed text-aizome transition-colors hover:bg-washi focus-visible:bg-washi focus-visible:outline-2 focus-visible:outline-aizome"
                  >
                    {phrase}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}