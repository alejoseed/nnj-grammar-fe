// Dev-only companion to the TanStack devtools inspector. Its inspector skips
// anything that is not an HTMLElement, so the D3 graph's SVG nodes never open.
// This mirrors its behavior for SVG: hold the inspect hotkey, hover to see the
// source, click to open it in the editor.

import { z } from "zod";

const SETTINGS_KEY = "tanstack_devtools_settings";

// The subset of the devtools' stored settings this bridge reads.
const InspectorSettings = z.object({
  inspectHotkey: z.array(z.string()).default(["Shift", "Alt", "CtrlOrMeta"]),
  sourceAction: z.string().default("ide-warp"),
});
type InspectorSettings = z.infer<typeof InspectorSettings>;

function readSettings(): InspectorSettings {
  try {
    return InspectorSettings.parse(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"),
    );
  } catch {
    return InspectorSettings.parse({});
  }
}

// Same rule as the devtools: every combo key held, and nothing else.
function hotkeyHeld(pressed: Set<string>, hotkey: string[]): boolean {
  const held = [...pressed].map((key) => key.toUpperCase());

  return ["Control", "Meta"].some((ctrlOrMeta) => {
    const combo = hotkey.map((key) =>
      (key === "CtrlOrMeta" ? ctrlOrMeta : key).toUpperCase(),
    );

    return (
      combo.every((key) => held.includes(key)) &&
      held.every((key) => combo.includes(key))
    );
  });
}

function openSource(source: string, sourceAction: string): void {
  if (sourceAction === "copy-path") {
    navigator.clipboard.writeText(source).catch(() => {});
    return;
  }

  const base = new URL(import.meta.env.BASE_URL, location.origin);

  fetch(
    new URL(`__tsd/open-source?source=${encodeURIComponent(source)}`, base),
  ).catch(() => {});
}

export function installSvgSourceInspector(): void {
  const pressed = new Set<string>();
  let disabledAfterClick = false;
  let highlighted: Element | undefined;
  let pointer = { x: 0, y: 0 };

  const box = document.createElement("div");

  box.style.cssText =
    "position:fixed;display:none;pointer-events:none;z-index:9999;" +
    "background-color:oklch(55.4% 0.046 257.417 / 0.25)";

  const label = document.createElement("div");

  label.style.cssText =
    "position:fixed;display:none;pointer-events:none;z-index:10000;" +
    "padding:2px 4px;border-radius:2px;font-size:12px;color:white;" +
    "background-color:oklch(55.4% 0.046 257.417 / 0.80)";
  document.body.append(box, label);

  const active = () =>
    !disabledAfterClick && hotkeyHeld(pressed, readSettings().inspectHotkey);

  const clear = () => {
    highlighted = undefined;
    box.style.display = "none";
    label.style.display = "none";
  };

  const refresh = () => {
    if (!active()) {
      clear();
      return;
    }

    const target = document.elementFromPoint(pointer.x, pointer.y);
    const tagged =
      target instanceof SVGElement
        ? target.closest("[data-tsd-source]")
        : null;

    if (!tagged) {
      clear();
      return;
    }

    if (tagged === highlighted) {
      return;
    }

    highlighted = tagged;

    const rect = tagged.getBoundingClientRect();

    Object.assign(box.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    label.textContent = tagged.getAttribute("data-tsd-source");
    Object.assign(label.style, {
      display: "block",
      left: `${Math.max(rect.left, 4)}px`,
      top: `${Math.max(rect.top - 26, 4)}px`,
    });
  };

  window.addEventListener("keydown", (event) => {
    pressed.add(event.key);
    refresh();
  });
  window.addEventListener("keyup", (event) => {
    pressed.delete(event.key);

    if (pressed.size === 0) {
      disabledAfterClick = false;
    }

    refresh();
  });
  window.addEventListener("blur", () => {
    pressed.clear();
    disabledAfterClick = false;
    clear();
  });
  document.addEventListener(
    "mousemove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      refresh();
    },
    true,
  );

  // Keep d3-zoom from starting a pan under the inspector click.
  const swallow = (event: Event) => {
    if (highlighted) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("pointerdown", swallow, true);
  document.addEventListener("mousedown", swallow, true);
  document.addEventListener(
    "click",
    (event) => {
      const source = highlighted?.getAttribute("data-tsd-source");

      if (!source) {
        return;
      }

      swallow(event);
      disabledAfterClick = true;
      clear();
      openSource(source, readSettings().sourceAction);
    },
    true,
  );
}
