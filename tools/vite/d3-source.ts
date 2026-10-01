import MagicString from "magic-string";
import { normalizePath, type Plugin } from "vite";

// The TanStack devtools inspector opens whatever `data-tsd-source` points at.
// Its JSX transform only tags JSX, so D3-created elements get the same
// attribute here, pointing at the `.append()` / `.join()` that created them.
const ELEMENT_CREATION = /\.(append|join)\(\s*(["'])([A-Za-z][\w:-]*)\2\s*\)/g;
const D3_IMPORT = /from\s+["']d3(?:-[a-z]+)?["']/;

export function tagD3Sources(code: string, location: string): MagicString | undefined {
  if (!D3_IMPORT.test(code)) {
    return undefined;
  }

  const s = new MagicString(code);

  for (const match of code.matchAll(ELEMENT_CREATION)) {
    // Point at the method name, not the leading dot.
    const offset = match.index + 1;
    const before = code.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - before.lastIndexOf("\n");
    const source = `${location}:${line}:${column}`;

    s.appendLeft(match.index + match[0].length, `.attr("data-tsd-source", ${JSON.stringify(source)})`);
  }

  return s.hasChanged() ? s : undefined;
}

export function d3Source(): Plugin {
  let root = "";

  return {
    name: "nnj:d3-source",
    enforce: "pre",
    apply: (_config, env) => env.command === "serve" && env.mode === "development",
    configResolved(config) {
      root = normalizePath(config.root);
    },
    transform(code, id) {
      const file = normalizePath(id.split("?")[0] ?? id);

      if (file.includes("/node_modules/") || !/\.[jt]sx?$/.test(file)) {
        return undefined;
      }

      const s = tagD3Sources(code, file.replace(root, ""));

      if (!s) {
        return undefined;
      }

      return { code: s.toString(), map: s.generateMap({ source: file, includeContent: true }) };
    },
  };
}
