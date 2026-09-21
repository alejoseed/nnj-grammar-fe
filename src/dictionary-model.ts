import type {
  AnalysisDocument,
  AnalysisTreeNode,
  AnalyzedToken,
  DictionaryGloss,
} from "./types";
import type { DictionaryEntry, DictionarySelection } from "./dictionary-entry";
import type { GraphNode } from "./graph-model";

interface LexicalEntry {
  entry: DictionaryEntry;
  node: AnalysisTreeNode;
}

// Schema v3's backend prepends at most two compound senses to every
// covered token, then appends each token's own senses.
// See nnj-grammar/src/dictionary.rs, gloss_tokens → entries_to_glosses(hits, 2).
const MAX_COMPOUND_GLOSSES = 2;


function sameGloss(left: DictionaryGloss | undefined, right: DictionaryGloss): boolean {
  return (
    left !== undefined &&
    left.entry_seq === right.entry_seq &&
    left.gloss === right.gloss &&
    left.pos.length === right.pos.length &&
    left.pos.every((part, index) => part === right.pos[index])
  );
}


function tokensInSpan(
  node: AnalysisTreeNode,
  tokensByPosition: Map<number, AnalyzedToken>,
): AnalyzedToken[] {
  if (
    node.token_start === null ||
    node.token_end === null ||
    node.token_end < node.token_start
  ) {
    return [];
  }

  const tokens: AnalyzedToken[] = [];

  for (let position = node.token_start; position <= node.token_end; position += 1) {
    const token = tokensByPosition.get(position);

    if (!token) {
      return [];
    }

    tokens.push(token);
  }

  return tokens;
}

function compoundGlosses(tokens: AnalyzedToken[]): DictionaryGloss[] {
  if (tokens.length < 2) {
    return [];
  }

  const first = tokens[0]!.glosses;
  let sharedPrefixLength = 0;

  while (
    sharedPrefixLength < MAX_COMPOUND_GLOSSES &&
    sharedPrefixLength < first.length
  ) {
    const gloss = first[sharedPrefixLength]!;

    if (!tokens.every((token) => sameGloss(token.glosses[sharedPrefixLength], gloss))) {
      break;
    }

    sharedPrefixLength += 1;
  }

  return first
    .slice(0, sharedPrefixLength)
    .filter((gloss, index) => index === 0 || !sameGloss(first[0], gloss));
}

export function resolveDictionarySelection(
  document: AnalysisDocument,
  node: GraphNode,
): DictionarySelection | null {
  const tokensById = new Map(document.tokens.map((token) => [token.id, token]));
  const tokensByPosition = new Map(
    document.tokens.map((token) => [token.position, token]),
  );
  const primaryById = new Map(
    document.primary_matches.map((match) => [match.id, match]),
  );
  const secondaryById = new Map(
    document.secondary_matches.map((secondary) => [secondary.id, secondary.matched]),
  );
  const lexical: LexicalEntry[] = [];
  const entriesById = new Map<string, DictionaryEntry>();
  const lexicalNodes = document.tree.nodes
    .filter((candidate) => candidate.kind === "token" || candidate.kind === "word")
    .sort((left, right) => (left.token_start ?? 0) - (right.token_start ?? 0));

  for (const lexicalNode of lexicalNodes) {
    const token = tokensById.get(lexicalNode.token_id ?? "");
    const pieces = lexicalNode.kind === "word"
      ? tokensInSpan(lexicalNode, tokensByPosition)
      : token ? [token] : [];

    if (pieces.length === 0) {
      continue;
    }

    const entry: DictionaryEntry = {
      id: lexicalNode.id,
      term: pieces.map((piece) => piece.surface).join(""),
      reading: pieces.map((piece) => piece.reading).join(""),
      kind: "word",
      glosses: lexicalNode.kind === "word"
        ? compoundGlosses(pieces)
        : pieces[0]!.glosses,
      hint: null,
      level: "",
    };
    lexical.push({ node: lexicalNode, entry });
    entriesById.set(entry.id, entry);
  }

  for (const match of [...primaryById.values(), ...secondaryById.values()]) {
    const id = `relation-${match.id}`;
    entriesById.set(id, {
      id,
      term: match.rule_name,
      reading: "",
      kind: "grammar",
      glosses: match.meaning_en.trim()
        ? [{ entry_seq: 0, gloss: match.meaning_en, pos: [] }]
        : [],
      hint: match.hint,
      level: match.jlpt,
    });
  }

  const entries = [...entriesById.values()];

  if (node.kind === "relation") {
    const isRenderedRelation = document.tree.nodes.some((candidate) =>
      candidate.kind === "sentence" && (
        candidate.match_ids.some((id) => {
          const match = primaryById.get(id);
          return match !== undefined && `relation-${match.id}` === node.id;
        }) ||
        candidate.secondary_match_ids.some((id) => {
          const match = secondaryById.get(id);
          return match !== undefined && `relation-${match.id}` === node.id;
        })
      ),
    );
    return isRenderedRelation && entriesById.has(node.id)
      ? { entries, selectedId: node.id }
      : null;
  }

  const treeNode = document.tree.nodes.find(
    (candidate) => candidate.id === node.id && candidate.kind === node.kind,
  );

  if (!treeNode) {
    return null;
  }

  if (treeNode.kind === "token" || treeNode.kind === "word") {
    return entriesById.has(treeNode.id)
      ? { entries, selectedId: treeNode.id }
      : null;
  }

  if (treeNode.kind === "bunsetsu") {
    for (const matchId of treeNode.match_ids) {
      const match = primaryById.get(matchId);

      if (match) {
        return { entries, selectedId: `relation-${match.id}` };
      }
    }
  }

  const { token_start: start, token_end: end } = treeNode;
  const firstCovered = start === null || end === null ? undefined : lexical.find(
    ({ node: candidate }) =>
      candidate.token_start !== null &&
      candidate.token_end !== null &&
      start <= candidate.token_start &&
      candidate.token_end <= end,
  );
  return firstCovered ? { entries, selectedId: firstCovered.entry.id } : null;
}
