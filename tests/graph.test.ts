import { select, timerFlush, type HierarchyPointNode } from "d3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../nnj-grammar/tests/fixtures/analysis-soshite.json";
import hanbaiki from "../../nnj-grammar/tests/fixtures/analysis-hanbaiki.json";
import { buildGraphModel, type GraphNode, type RubyRun } from "../src/graph-model";
import { placeRuby, renderGraph } from "../src/graph";
import { AnalysisDocument } from "../src/types";

describe("renderGraph", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    renderGraph(
      host,
      buildGraphModel(AnalysisDocument.parse(fixture)),
    );
  });

  afterEach(() => vi.useRealTimers());

  it("renders the faithful Hanabira structure", () => {
    const svg = host.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1200 800");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg?.getAttribute("role")).toBe("tree");
    expect(svg?.getAttribute("aria-label")).toBe("Grammar analysis tree");
    expect(svg?.classList.contains("bg-washi")).toBe(true);
    expect(host.querySelectorAll(".graph-node")).toHaveLength(7);
    expect(host.querySelectorAll(".graph-link")).toHaveLength(6);
    expect(
      host.querySelector("[data-layer=plot]")?.getAttribute("transform"),
    ).toBe("translate(200,20)");
    // The lone sentence scaffold is hoisted away entirely.
    expect(host.querySelector("#graph-node-sentence-0")).toBeNull();
    expect(host.textContent).toContain("なによりも");
    expect(host.textContent).toContain("(Above all else, more than anything)");

    const internalLabel = host.querySelector(
      "#graph-node-bunsetsu-0-1 .graph-primary-label",
    );
    expect(internalLabel?.getAttribute("x")).toBe("-10");
    expect(internalLabel?.getAttribute("dy")).toBe("-18");
    expect(internalLabel?.getAttribute("text-anchor")).toBe("end");
    const leafLabel = host.querySelector(
      "#graph-node-token-1 .graph-primary-label",
    );
    expect(leafLabel?.getAttribute("x")).toBe("10");
    expect(leafLabel?.getAttribute("dy")).toBe("4.2");
    expect(leafLabel?.getAttribute("text-anchor")).toBe("start");
  });

  it("uses stable accessible node identities", () => {
    const node = host.querySelector("#graph-node-bunsetsu-0-1");
    expect(node?.getAttribute("role")).toBe("treeitem");
    expect(node?.getAttribute("tabindex")).toBe("0");
    expect(node?.getAttribute("aria-label")).toContain("なによりも");
    expect(
      node?.querySelector("circle")?.classList.contains("fill-washi"),
    ).toBe(true);
    expect(
      host
        .querySelector("#graph-node-document-0 circle")
        ?.classList.contains("fill-aizome"),
    ).toBe(true);
  });

  it.each(["mouseenter", "focus"])(
    "applies vermilion emphasis on %s",
    (eventName) => {
      const node = host.querySelector<SVGGElement>("#graph-node-bunsetsu-0-1")!;
      node.dispatchEvent(new Event(eventName));
      vi.advanceTimersByTime(200);
      timerFlush();
      expect(node.querySelector("circle")?.getAttribute("r")).toBe("10");
      expect(node.querySelector<SVGCircleElement>("circle")?.style.fill).toBe(
        "var(--color-shu)",
      );
      expect(node.querySelector<SVGTextElement>("text")?.style.fontWeight).toBe(
        "bold",
      );
      expect(node.querySelector<SVGTextElement>("text")?.style.fill).toBe(
        "var(--color-shu)",
      );

      node.dispatchEvent(
        new Event(eventName === "mouseenter" ? "mouseleave" : "blur"),
      );
      expect(node.querySelector("circle")?.getAttribute("r")).toBe("6");
      expect(node.querySelector<SVGCircleElement>("circle")?.style.fill).toBe(
        "",
      );
      expect(
        node.querySelector("circle")?.classList.contains("fill-washi"),
      ).toBe(true);
      expect(node.querySelector<SVGTextElement>("text")?.style.fill).toBe("");
      expect(node.querySelector<SVGTextElement>("text")?.style.fontWeight).toBe(
        "normal",
      );
    },
  );

  it("keeps emphasis while either hover or focus remains active", () => {
    const node = host.querySelector<SVGGElement>("#graph-node-bunsetsu-0-1")!;
    node.dispatchEvent(new Event("focus"));
    node.dispatchEvent(new Event("mouseenter"));
    node.dispatchEvent(new Event("mouseleave"));
    expect(node.querySelector("circle")?.getAttribute("r")).toBe("10");

    node.dispatchEvent(new Event("blur"));
    expect(node.querySelector("circle")?.getAttribute("r")).toBe("6");
  });
});

function rubyAttributes(host: HTMLElement, nodeId: string, name: string) {
  return [...host.querySelectorAll(`#graph-node-${nodeId} .graph-ruby`)].map(
    (ruby) => ruby.getAttribute(name),
  );
}

describe("renderGraph furigana", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    renderGraph(host, buildGraphModel(AnalysisDocument.parse(hanbaiki)));
  });

  afterEach(() => vi.useRealTimers());

  it("places one ruby over each kanji run of a leaf label", () => {
    expect(host.querySelectorAll(".graph-ruby")).toHaveLength(10);
    const rubies = [...host.querySelectorAll("#graph-node-word-0-2 .graph-ruby")];
    expect(rubies.map((ruby) => ruby.textContent)).toEqual([
      "じどう",
      "はんばい",
      "き",
    ]);
    expect(rubyAttributes(host, "word-0-2", "x")).toEqual(["22", "46", "64"]);
    expect(rubyAttributes(host, "word-0-2", "y")).toEqual(["-10.8", "-10.8", "-10.8"]);
    expect(rubyAttributes(host, "word-0-2", "textLength")).toEqual([
      null,
      "24",
      null,
    ]);
    expect(rubyAttributes(host, "word-0-2", "lengthAdjust")).toEqual([
      null,
      "spacingAndGlyphs",
      null,
    ]);
    expect(rubyAttributes(host, "word-0-2", "data-ruby-start")).toEqual([
      "0",
      "2",
      "4",
    ]);
    expect(rubyAttributes(host, "word-0-2", "data-ruby-length")).toEqual([
      "2",
      "2",
      "1",
    ]);
    for (const ruby of rubies) {
      expect(ruby.getAttribute("text-anchor")).toBe("middle");
      expect(ruby.getAttribute("aria-hidden")).toBe("true");
      expect(ruby.classList.contains("fill-fog")).toBe(true);
      expect(ruby.getAttribute("font-size")).toBe("7");
      expect(ruby.classList.contains("italic")).toBe(false);
    }
  });

  it("places ruby over right-aligned internal labels", () => {
    expect(rubyAttributes(host, "bunsetsu-0-0", "x")).toEqual(["-70", "-46", "-28"]);
    expect(rubyAttributes(host, "bunsetsu-0-0", "y")).toEqual(["-33", "-33", "-33"]);
    expect(rubyAttributes(host, "bunsetsu-0-0", "textLength")).toEqual([
      null,
      "24",
      null,
    ]);
    expect(rubyAttributes(host, "bunsetsu-0-1", "x")).toEqual(["-28"]);
    expect(rubyAttributes(host, "bunsetsu-0-1", "textLength")).toEqual([null]);
    expect(rubyAttributes(host, "token-4", "x")).toEqual(["16"]);
  });

  it("measures each reading afresh when ruby is placed again", () => {
    const group = host.querySelector<SVGGElement>("#graph-node-word-0-2")!;
    const point = select<SVGGElement, HierarchyPointNode<GraphNode>>(group).datum();
    placeRuby(group, point);
    expect(rubyAttributes(host, "word-0-2", "textLength")).toEqual([
      null,
      "24",
      null,
    ]);
    expect(rubyAttributes(host, "word-0-2", "lengthAdjust")).toEqual([
      null,
      "spacingAndGlyphs",
      null,
    ]);

    group.querySelectorAll(".graph-ruby")[1]!.textContent = "は";
    placeRuby(group, point);
    expect(rubyAttributes(host, "word-0-2", "textLength")).toEqual([
      null,
      null,
      null,
    ]);
    expect(rubyAttributes(host, "word-0-2", "lengthAdjust")).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("leaves kana labels without ruby", () => {
    expect(
      host.querySelector("#graph-node-token-3 .graph-primary-label")?.textContent,
    ).toBe("で");
    expect(host.querySelectorAll("#graph-node-token-3 .graph-ruby")).toHaveLength(0);
  });

  it("recolors ruby on emphasis but keeps its regular weight", () => {
    const node = host.querySelector<SVGGElement>("#graph-node-word-0-2")!;
    const rubies = [...node.querySelectorAll<SVGTextElement>(".graph-ruby")];
    node.dispatchEvent(new Event("mouseenter"));
    expect(rubies.map((ruby) => ruby.style.fill)).toEqual([
      "var(--color-shu)",
      "var(--color-shu)",
      "var(--color-shu)",
    ]);
    expect(rubies.map((ruby) => ruby.style.fontWeight)).toEqual(["", "", ""]);
    expect(
      node.querySelector<SVGTextElement>(".graph-primary-label")?.style.fontWeight,
    ).toBe("bold");

    node.dispatchEvent(new Event("mouseleave"));
    expect(rubies.map((ruby) => ruby.style.fill)).toEqual(["", "", ""]);
    expect(rubies.map((ruby) => ruby.style.fontWeight)).toEqual(["", "", ""]);
  });

  it("renders a document from a backend that predates furigana without ruby", () => {
    const legacy = AnalysisDocument.parse(hanbaiki);
    for (const token of legacy.tokens) {
      delete token.furigana;
    }
    renderGraph(host, buildGraphModel(legacy));
    expect(host.querySelectorAll(".graph-ruby")).toHaveLength(0);
    expect(
      host.querySelector("#graph-node-word-0-2 .graph-primary-label")?.textContent,
    ).toBe("自動販売機");
  });
});

describe("renderGraph ruby compression", () => {
  function node(
    id: string,
    kind: GraphNode["kind"],
    primaryLabel: string,
    children: GraphNode[],
  ): GraphNode {
    return {
      id,
      kind,
      primaryLabel,
      ruby:
        primaryLabel === ""
          ? []
          : [{ start: 0, length: 1, reading: "うけたまわ" }],
      secondaryLabel: "",
      children,
    };
  }

  it("squeezes a long reading to its cap and counts it toward column spacing", () => {
    const host = document.createElement("div");
    renderGraph(
      host,
      node("document-0", "document", "", [
        node("bunsetsu-0-0", "bunsetsu", "承る", [
          node("token-0", "token", "承る", []),
        ]),
      ]),
    );

    expect(rubyAttributes(host, "bunsetsu-0-0", "x")).toEqual(["-28"]);
    expect(rubyAttributes(host, "bunsetsu-0-0", "y")).toEqual(["-33"]);
    expect(rubyAttributes(host, "bunsetsu-0-0", "textLength")).toEqual(["18"]);
    expect(rubyAttributes(host, "bunsetsu-0-0", "lengthAdjust")).toEqual([
      "spacingAndGlyphs",
    ]);
    expect(rubyAttributes(host, "token-0", "x")).toEqual(["16"]);
    expect(rubyAttributes(host, "token-0", "y")).toEqual(["-10.8"]);
    expect(rubyAttributes(host, "token-0", "textLength")).toEqual(["18"]);
    expect(
      ["document-0", "bunsetsu-0-0", "token-0"].map((id) =>
        host.querySelector(`#graph-node-${id}`)?.getAttribute("transform"),
      ),
    ).toEqual(["translate(0,40)", "translate(79,40)", "translate(131,40)"]);
  });

  it("estimates halfwidth katakana as narrow and an astral kanji as one character", () => {
    const leaf = (id: string, primaryLabel: string, ruby: RubyRun[]): GraphNode => ({
      id,
      kind: "token",
      primaryLabel,
      ruby,
      secondaryLabel: "",
      children: [],
    });
    const host = document.createElement("div");
    renderGraph(host, {
      id: "document-0",
      kind: "document",
      primaryLabel: "",
      ruby: [],
      secondaryLabel: "",
      children: [
        leaf("token-0", "ｶ月", [{ start: 1, length: 1, reading: "げつ" }]),
        leaf("token-1", "𩸽を", [{ start: 0, length: 2, reading: "ほっけ" }]),
      ],
    });

    expect(rubyAttributes(host, "token-0", "x")).toEqual(["23.2"]);
    expect(rubyAttributes(host, "token-1", "x")).toEqual(["16"]);
  });
});
