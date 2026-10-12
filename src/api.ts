import { z } from "zod";
import { buildGraphModel, type GraphNode } from "./graph-model";
import type { LayoutFeedback } from "./layout-lab-model";
import { AnalysisDocument } from "./types";

export type GraphRenderer = (host: HTMLElement, model: GraphNode) => void;

const API_BASE: string = import.meta.env.VITE_API_URL ?? "";

export async function loadAnalysisDocument(url: URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fixture request failed: ${response.status}`);
  }
  return AnalysisDocument.parse(await response.json());
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
  return AnalysisDocument.parse(await response.json());
}

const SubmitAccepted = z.object({ id: z.number(), status: z.string() });
const ApiErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const DEVICE_STORAGE_KEY = "nnj-grammar.device";
let sessionDeviceId: string | null = null;

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (saved) {
      return saved;
    }
    const created = randomId();
    localStorage.setItem(DEVICE_STORAGE_KEY, created);
    return created;
  } catch {
    sessionDeviceId ??= randomId();
    return sessionDeviceId;
  }
}

export type SubmitResult =
  | { kind: "sent"; id: number }
  | { kind: "refused"; code: string; message: string }
  | { kind: "unreachable" };

export async function submitLayout(
  classCode: string,
  nickname: string,
  feedback: LayoutFeedback,
): Promise<SubmitResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/layouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_code: classCode, device_id: deviceId(), nickname, feedback }),
    });
  } catch {
    return { kind: "unreachable" };
  }
  const body: unknown = await response.json().catch(() => null);
  const accepted = SubmitAccepted.safeParse(body);
  if (response.ok && accepted.success) {
    return { kind: "sent", id: accepted.data.id };
  }
  const refused = ApiErrorBody.safeParse(body);
  if (!refused.success || refused.data.error.code === "layouts_unavailable") {
    return { kind: "unreachable" };
  }
  return { kind: "refused", ...refused.data.error };
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
