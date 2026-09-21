import { buildGraphModel, type GraphNode } from "./graph-model";
import { parseAnalysisDocument } from "./types";

export type GraphRenderer = (host: HTMLElement, model: GraphNode) => void;

const API_BASE: string = import.meta.env.VITE_API_URL ?? "";

export async function loadAnalysisDocument(url: URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fixture request failed: ${response.status}`);
  }
  return parseAnalysisDocument(await response.json());
}

export async function analyzeText(text: string) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`analyze request failed: ${response.status}`);
  }
  return parseAnalysisDocument(await response.json());
}

function showGraphError(host: HTMLElement): void {
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  error.className =
    "m-8 rounded border border-shu/40 bg-shu/5 p-4 text-sm text-shu";
  error.textContent = "Unable to load grammar graph.";
  host.replaceChildren(error);
}

export async function mountFixtureGraph(
  host: HTMLElement,
  url: URL,
  render: GraphRenderer,
): Promise<void> {
  try {
    const document = await loadAnalysisDocument(url);
    render(host, buildGraphModel(document));
  } catch {
    showGraphError(host);
  }
}
