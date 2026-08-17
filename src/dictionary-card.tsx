import type { DisplayMatch, SecondaryReason } from "./types";

export interface DictionaryCardProps {
  match: DisplayMatch;
  /** Present when the engine considered this match but suppressed it. */
  suppression?: {
    reason: SecondaryReason;
    blockedBy: string | null;
  };
}

const REASON_TEXT: Record<SecondaryReason, string> = {
  contained_by_stronger_match: "contained by a stronger match",
  overlaps_stronger_match: "overlaps a stronger match",
};

export function DictionaryCard({ match, suppression }: DictionaryCardProps) {
  return (
    <article className="rounded border border-mist bg-white p-4">
      <header className="flex items-center gap-2">
        <h3 className="font-bold text-aizome">{match.rule_name}</h3>
        {match.jlpt !== "" && (
          <span className="rounded bg-shu px-1.5 py-0.5 text-xs font-medium text-white">
            {match.jlpt}
          </span>
        )}
      </header>
      <p className="mt-1 text-sm text-aizome">{match.meaning_en}</p>
      {match.hint !== null && (
        <p className="mt-1 text-sm text-fog">Formation: {match.hint}</p>
      )}
      {suppression && (
        <p className="mt-1 text-sm text-shu">
          suppressed: {REASON_TEXT[suppression.reason]}
          {suppression.blockedBy !== null && ` (by ${suppression.blockedBy})`}
        </p>
      )}
      {match.provenance.map((entry) => (
        <p
          key={`${entry.source.id}:${entry.rule_id}:${entry.variant_id}`}
          className="mt-2 text-xs text-fog"
        >
          source: {entry.source.label} · {entry.rule_id}
        </p>
      ))}
    </article>
  );
}
