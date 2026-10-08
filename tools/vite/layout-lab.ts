import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { isSafeKey, LayoutFeedback } from "../../src/dev/layout-lab-model";

export const LAYOUT_LAB_ROUTE = "/__layout-lab";
export const LAYOUT_LAB_DIRECTORY = "layout-feedback";

export interface LabRequest {
  method: string;
  url: string;
  body: string;
}

export interface LabResponse {
  status: number;
  body: unknown;
}

function entryPath(directory: string, key: string): string {
  return path.join(directory, `${key}.json`);
}

export async function handleLayoutLab(request: LabRequest, directory: string): Promise<LabResponse> {
  const url = new URL(request.url, "http://lab");
  if (url.pathname === "/entries" && request.method === "GET") {
    await mkdir(directory, { recursive: true });
    const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
    const entries = await Promise.all(
      files.map(async (file) => {
        const saved = LayoutFeedback.safeParse(JSON.parse(await readFile(path.join(directory, file), "utf8")));
        return saved.success
          ? { key: file.slice(0, -".json".length), sentence: saved.data.sentence, savedAt: saved.data.savedAt }
          : null;
      }),
    );
    return { status: 200, body: entries.filter((entry) => entry !== null) };
  }

  const key = url.searchParams.get("key") ?? "";
  if (url.pathname !== "/entry" || !isSafeKey(key)) {
    return { status: 404, body: { error: "unknown route or unsafe key" } };
  }
  if (request.method === "GET") {
    try {
      return { status: 200, body: JSON.parse(await readFile(entryPath(directory, key), "utf8")) };
    } catch {
      return { status: 404, body: { error: "no saved arrangement" } };
    }
  }
  if (request.method === "PUT") {
    let parsed;
    try {
      parsed = LayoutFeedback.safeParse(JSON.parse(request.body));
    } catch {
      return { status: 400, body: { error: "body is not JSON" } };
    }
    if (!parsed.success) {
      return { status: 400, body: { error: "body is not a layout feedback document" } };
    }
    await mkdir(directory, { recursive: true });
    await writeFile(entryPath(directory, key), `${JSON.stringify(parsed.data, null, 2)}\n`);
    return { status: 200, body: { path: path.relative(path.dirname(directory), entryPath(directory, key)) } };
  }
  return { status: 405, body: { error: "method not allowed" } };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function layoutLab(): Plugin {
  return {
    name: "nnj:layout-lab",
    apply: "serve",
    configureServer(server) {
      const directory = path.join(server.config.root, LAYOUT_LAB_DIRECTORY);
      server.middlewares.use(LAYOUT_LAB_ROUTE, (request: IncomingMessage, response: ServerResponse) => {
        void (async () => {
          const result = await handleLayoutLab(
            { method: request.method ?? "GET", url: request.url ?? "/", body: await readBody(request) },
            directory,
          );
          response.statusCode = result.status;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(result.body));
        })().catch(() => {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: "layout lab request failed" }));
        });
      });
    },
  };
}
