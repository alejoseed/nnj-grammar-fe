import { z } from "zod";

export const LayoutSettings = z.object({
  rowClearancePx: z.number().min(0).max(60),
  groupGapPx: z.number().min(0).max(120),
  columnGapPx: z.number().min(40).max(320),
  fitToFrame: z.boolean(),
});
export type LayoutSettings = z.infer<typeof LayoutSettings>;

export const DEFAULT_LAYOUT: LayoutSettings = {
  rowClearancePx: 12,
  groupGapPx: 0,
  columnGapPx: 80,
  fitToFrame: true,
};

export const LAYOUT_STORAGE_KEY = "nnj-grammar.layout";

type SettingsStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): SettingsStore | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadLayoutSettings(store: SettingsStore | null = browserStorage()): LayoutSettings {
  try {
    const raw = store?.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_LAYOUT;
    }
    const parsed = LayoutSettings.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayoutSettings(
  settings: LayoutSettings,
  store: SettingsStore | null = browserStorage(),
): boolean {
  try {
    store?.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(settings));
    return store !== null;
  } catch {
    return false;
  }
}

export function clearLayoutSettings(store: SettingsStore | null = browserStorage()): void {
  try {
    store?.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
  }
}

export function sameLayout(a: LayoutSettings, b: LayoutSettings): boolean {
  return (
    a.rowClearancePx === b.rowClearancePx &&
    a.groupGapPx === b.groupGapPx &&
    a.columnGapPx === b.columnGapPx &&
    a.fitToFrame === b.fitToFrame
  );
}
