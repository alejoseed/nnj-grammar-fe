import type { DictionaryGloss } from "./types";

export interface DictionaryEntry {
  id: string;
  term: string;
  reading: string;
  kind: "word" | "grammar";
  glosses: DictionaryGloss[];
  hint: string | null;
  level: string;
}

export interface DictionarySelection {
  entries: DictionaryEntry[];
  selectedId: string;
}
