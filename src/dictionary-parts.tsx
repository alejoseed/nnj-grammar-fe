import type { DictionaryEntry } from "./dictionary-entry";

export function EntryHeading({ entry }: { entry: DictionaryEntry }) {
  return (
    <header className="entry-heading min-w-0">
      {entry.reading && <p className="entry-reading mb-1 text-xs tracking-widest wrap-anywhere text-fog" lang="ja">{entry.reading}</p>}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="entry-term m-0 mr-2 min-w-0 max-w-full font-serif text-[43px] leading-[1.3] font-normal wrap-anywhere text-aizome" lang="ja">{entry.term}</h3>
        {entry.kind === "grammar" && (
          <>
            <span className="entry-kind max-w-full rounded border border-mist px-1.5 py-0.5 text-xs font-medium wrap-anywhere text-aizome">Grammar</span>
            {entry.level && <span className="entry-level max-w-full rounded bg-shu px-1.5 py-0.5 text-xs font-medium wrap-anywhere text-white">{entry.level}</span>}
          </>
        )}
      </div>
    </header>
  );
}

export function EntrySenses({ entry }: { entry: DictionaryEntry }) {
  const definitionClass = "m-0 leading-relaxed wrap-anywhere text-aizome text-[15px]";
  const typeClass = "max-w-full rounded bg-washi px-1.5 py-0.5 leading-normal wrap-anywhere text-fog text-xs";

  return (
    <>
      {entry.glosses.length > 0 ? (
        <ul className="entry-senses m-0 min-w-0 list-none p-0">
          {entry.glosses.map((sense, index) => (
            <li
              className="entry-sense min-w-0 border-b border-mist py-4"
              key={`${sense.entry_seq}:${index}`}
            >
              <div className="min-w-0">
                {sense.pos.length > 0 && (
                  <div className="entry-pos mb-2 flex min-w-0 flex-wrap gap-1">
                    {sense.pos.map((pos, posIndex) => <span className={typeClass} key={`${pos}:${posIndex}`}>{pos}</span>)}
                  </div>
                )}
                <p className={definitionClass}>{sense.gloss}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${definitionClass} border-b border-mist py-4`}>No definitions returned for this entry.</p>
      )}
      {entry.hint && (
        <section className="entry-formation min-w-0 border-mist border-b py-4">
          <h4 className={`mb-2 inline-block font-normal ${typeClass}`}>Formation</h4>
          <p className={definitionClass}>{entry.hint}</p>
        </section>
      )}
      <p className="entry-end m-0 py-4 text-center text-[10px] text-fog">
        {entry.glosses.length} {entry.glosses.length === 1 ? "Entry" : "Entries"}
      </p>
    </>
  );
}
