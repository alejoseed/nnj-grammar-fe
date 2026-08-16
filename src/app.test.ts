import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../nnj-grammar/tests/fixtures/analysis-soshite.json";
import { mountFixtureGraph } from "./app";

const fixtureUrl = new URL("https://fixture.invalid/analysis.json");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mountFixtureGraph", () => {
  it("loads, validates, and renders the fixture", async () => {
    const host = document.createElement("div");
    const render = vi.fn();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await mountFixtureGraph(host, fixtureUrl, render);

    expect(fetchMock).toHaveBeenCalledWith(fixtureUrl);
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[1]).toMatchObject({
      id: "document-0",
      kind: "document",
    });
    expect(host.querySelector("[role=alert]")).toBeNull();
  });

  it.each([
    new Response("unavailable", { status: 503 }),
    new Response("not json", { status: 200 }),
    new Response(JSON.stringify({ ...fixture, schema_version: 1 }), {
      status: 200,
    }),
  ])("shows one safe error without rendering partial data", async (response) => {
    const host = document.createElement("div");
    const render = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => response.clone()));

    await mountFixtureGraph(host, fixtureUrl, render);

    expect(render).not.toHaveBeenCalled();
    expect(host.querySelector("[role=alert]")?.textContent).toBe(
      "Unable to load grammar graph.",
    );
    expect(host.textContent).not.toContain(fixture.input);
  });
});
