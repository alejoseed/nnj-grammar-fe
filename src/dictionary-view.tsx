import type { DictionaryEntry } from "./dictionary-entry";
import { EntryHeading, EntrySenses } from "./dictionary-parts";

interface DictionaryViewProps {
  entries: DictionaryEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function DictionaryView({ entries, selectedId, onSelect, onClose }: DictionaryViewProps) {
  const selected = entries.find((entry) => entry.id === selectedId);
  if (!selected) return null;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white text-aizome" aria-label={`${selected.term} dictionary page`}>
      <header className="flex min-h-12 shrink-0 items-center border-b border-mist px-3.5">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border-mist bg-transparent text-aizome hover:bg-aizome/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aizome"
          onClick={onClose}
          aria-label="Back to graph"
          data-dictionary-close
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="rotate-180">
            <path d="M4 12h15m-6-6 6 6-6 6" />
          </svg>
        </button>
      </header>

      <div className="max-h-[40%] min-w-0 shrink-0 overflow-y-auto overscroll-contain px-4 pt-5 pb-3 [&_.entry-term]:text-5xl">
        <EntryHeading entry={selected} />
      </div>

      {entries.length > 1 && (
        <nav className="entry-switcher flex min-w-0 shrink-0 gap-1.5 overflow-x-auto px-3 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Look up another entry">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="entry-switcher__button min-h-9 shrink-0 rounded-full border border-mist bg-white px-2.5 py-2 font-serif text-xs leading-none whitespace-nowrap text-fog hover:border-aizome aria-pressed:border-aizome aria-pressed:bg-aizome aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aizome"
              aria-label={`Look up ${entry.term}`}
              lang="ja"
              aria-pressed={entry.id === selectedId}
              onClick={() => onSelect(entry.id)}
            >
              {entry.term}
            </button>
          ))}
        </nav>
      )}

      <div
        key={selected.id}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain border-t border-mist px-4 pt-3.5 pb-6 [scrollbar-width:thin]"
        tabIndex={0}
        aria-label={`${selected.term} definitions`}
      >
        <div className="mb-2.5 text-[10px] font-medium tracking-widest text-fog uppercase">Meanings</div>
        <EntrySenses entry={selected} />
      </div>
    </section>
  );
}
