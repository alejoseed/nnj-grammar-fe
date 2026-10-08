import { timerFlush } from "d3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../nnj-grammar/tests/fixtures/analysis-soshite.json";
import hanbaiki from "../../nnj-grammar/tests/fixtures/analysis-hanbaiki.json";
import { buildGraphModel, type GraphNode, type RubyRun } from "../src/graph-model";
import { linkPath, placeRuby, renderGraph, sampleLink } from "../src/graph";
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
    expect(
      [...host.querySelectorAll("#graph-node-bunsetsu-0-1 .graph-secondary-label tspan")].map(
        (line) => line.textContent,
      ),
    ).toEqual(["(Above all else,", "more than anything)"]);

    const internalLabel = host.querySelector(
      "#graph-node-bunsetsu-0-1 .graph-primary-label",
    );
    expect(internalLabel?.getAttribute("x")).toBe("-10");
    expect(internalLabel?.getAttribute("dy")).toBe("14.5");
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
    expect(node?.getAttribute("aria-label")).toBe(
      "なによりも (Above all else, more than anything)",
    );
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
    expect(rubyAttributes(host, "bunsetsu-0-0", "y")).toEqual(["-57", "-57", "-57"]);
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
    placeRuby(group);
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
    placeRuby(group);
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

describe("renderGraph gloss wrapping", () => {
  const leaf = (id: string, secondaryLabel: string): GraphNode => ({
    id,
    kind: "token",
    primaryLabel: "行か",
    ruby: [{ start: 0, length: 1, reading: "い" }],
    secondaryLabel,
    children: [],
  });
  const model = (gloss: string): GraphNode => ({
    id: "document-0",
    kind: "document",
    primaryLabel: "",
    ruby: [],
    secondaryLabel: "",
    children: [
      {
        id: "bunsetsu-0-0",
        kind: "bunsetsu",
        primaryLabel: "行かない",
        ruby: [{ start: 0, length: 1, reading: "い" }],
        secondaryLabel: gloss,
        children: [leaf("token-0", gloss), leaf("token-1", "not")],
      },
    ],
  });
  const gloss = "to go; to head (towards); to reach";
  const lines = (host: HTMLElement, id: string) =>
    [...host.querySelectorAll(`#graph-node-${id} .graph-secondary-label tspan`)].map(
      (tspan) => [tspan.getAttribute("y"), tspan.textContent],
    );
  const transforms = (host: HTMLElement) =>
    ["bunsetsu-0-0", "token-0", "token-1"].map((id) =>
      host.querySelector(`#graph-node-${id}`)?.getAttribute("transform"),
    );

  it("renders one line per tspan and lifts an internal label block by its extra lines", () => {
    const host = document.createElement("div");
    renderGraph(host, model(gloss));

    expect(lines(host, "token-0")).toEqual([
      ["15", "(to go; to head (towards);"],
      ["27", "to reach)"],
    ]);
    expect(lines(host, "bunsetsu-0-0")).toEqual([
      ["-17", "(to go; to head (towards);"],
      ["-5", "to reach)"],
    ]);
    expect(
      host.querySelector("#graph-node-bunsetsu-0-0 .graph-primary-label")?.getAttribute("dy"),
    ).toBe("-30");
    expect(rubyAttributes(host, "bunsetsu-0-0", "y")).toEqual(["-45"]);
    expect(rubyAttributes(host, "token-0", "y")).toEqual(["-10.8"]);
    expect(transforms(host)).toEqual([
      "translate(208,66)",
      "translate(260,40)",
      "translate(260,92)",
    ]);
  });

  it("keeps a gloss of up to 30 characters on one line", () => {
    const host = document.createElement("div");
    renderGraph(host, model("to go; to reach"));

    expect(lines(host, "token-0")).toEqual([["15", "(to go; to reach)"]]);
    expect(lines(host, "bunsetsu-0-0")).toEqual([["-5", "(to go; to reach)"]]);
    expect(rubyAttributes(host, "bunsetsu-0-0", "y")).toEqual(["-33"]);
    expect(transforms(host)).toEqual([
      "translate(154,66)",
      "translate(206,40)",
      "translate(206,92)",
    ]);
  });
});

describe("sampleLink", () => {
  it("follows d3.linkHorizontal's cubic from end to end", () => {
    expect(sampleLink({ x: 0, y: 0 }, { x: 100, y: 52 }, 39)).toEqual([
      { x: 0, y: 0 },
      { x: 29.6875, y: 8.125 },
      { x: 50, y: 26 },
      { x: 70.3125, y: 43.875 },
      { x: 100, y: 52 },
    ]);
  });

  it("keeps samples at most a step apart on a steep link", () => {
    const samples = sampleLink({ x: 0, y: 222 }, { x: 208, y: 66 }, 2);
    const gaps = samples.slice(1).map((sample, index) =>
      Math.hypot(sample.x - samples[index]!.x, sample.y - samples[index]!.y),
    );
    expect(samples).toHaveLength(235);
    expect(samples.at(-1)).toEqual({ x: 208, y: 66 });
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2);
  });
});

describe("linkPath", () => {
  it("is d3.linkHorizontal when the bend spans the whole gap", () => {
    expect(linkPath({ x: 0, y: 222 }, { x: 208, y: 66 }, { start: 0, end: 208 })).toBe(
      "M0,222C104,222,104,66,208,66",
    );
  });

  it("runs level into and out of a narrower bend", () => {
    expect(linkPath({ x: 0, y: 222 }, { x: 208, y: 66 }, { start: 10, end: 52 })).toBe(
      "M0,222L10,222C31,222,31,66,52,66L208,66",
    );
  });
});

describe("sampleLink with a bend", () => {
  it("stays level outside the bend and keeps samples a step apart", () => {
    const samples = sampleLink({ x: 0, y: 222 }, { x: 208, y: 66 }, 2, { start: 10, end: 52 });
    const gaps = samples.slice(1).map((sample, index) =>
      Math.hypot(sample.x - samples[index]!.x, sample.y - samples[index]!.y),
    );
    expect(samples[0]).toEqual({ x: 0, y: 222 });
    expect(samples.at(-1)).toEqual({ x: 208, y: 66 });
    expect(samples.filter((sample) => sample.x <= 10).every((sample) => sample.y === 222)).toBe(true);
    expect(samples.filter((sample) => sample.x >= 52).every((sample) => sample.y === 66)).toBe(true);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2);
  });
});

describe("renderGraph label placement", () => {
  const ruby: RubyRun[] = [{ start: 0, length: 1, reading: "い" }];
  const token = (id: string): GraphNode => ({
    id,
    kind: "token",
    primaryLabel: "行か",
    ruby,
    secondaryLabel: "to go",
    children: [],
  });
  const bunsetsu = (id: string, secondaryLabel: string, leaves: number): GraphNode => ({
    id,
    kind: "bunsetsu",
    primaryLabel: "行かない",
    ruby,
    secondaryLabel,
    children: Array.from({ length: leaves }, (_, index) => token(`${id}-token-${index}`)),
  });
  const scaffold = (id: string, kind: GraphNode["kind"], children: GraphNode[]): GraphNode => ({
    id,
    kind,
    primaryLabel: "",
    ruby: [],
    secondaryLabel: "",
    children,
  });
  const render = (model: GraphNode): HTMLElement => {
    const host = document.createElement("div");
    renderGraph(host, model);
    return host;
  };
  const block = (host: HTMLElement, id: string) => ({
    primary: host.querySelector(`#graph-node-${id} .graph-primary-label`)?.getAttribute("dy"),
    gloss: [...host.querySelectorAll(`#graph-node-${id} .graph-secondary-label tspan`)].map(
      (line) => line.getAttribute("y"),
    ),
    ruby: rubyAttributes(host, id, "y"),
  });
  const rowOf = (host: HTMLElement, id: string): number =>
    Number(
      /,([-\d.]+)\)$/.exec(host.querySelector(`#graph-node-${id}`)?.getAttribute("transform") ?? "")?.[1],
    );
  const fallbacks = (host: HTMLElement) =>
    host.querySelector("svg")?.getAttribute("data-label-fallbacks");

  it("hangs a last child's label just under its center line and keeps a first child's above", () => {
    const host = render(
      scaffold("document-0", "document", [
        bunsetsu("bunsetsu-0-0", "Will/Does/Do (not)", 1),
        bunsetsu("bunsetsu-0-1", "to go; to head (towards); to reach", 1),
      ]),
    );

    expect(block(host, "bunsetsu-0-0")).toEqual({ primary: "-18", gloss: ["-5"], ruby: ["-33"] });
    expect(block(host, "bunsetsu-0-1")).toEqual({
      primary: "24.5",
      gloss: ["37.5", "49.5"],
      ruby: ["9.5"],
    });
    expect(["bunsetsu-0-0", "document-0", "bunsetsu-0-1"].map((id) => rowOf(host, id))).toEqual([
      40, 92, 144,
    ]);
    expect(fallbacks(host)).toBe("0");
  });

  it("keeps a middle child above when the link to the last child crosses below, though its parent sits above it", () => {
    const host = render(
      scaffold("document-0", "document", [
        bunsetsu("bunsetsu-0-0", "", 2),
        bunsetsu("bunsetsu-0-1", "", 1),
        bunsetsu("bunsetsu-0-2", "", 1),
      ]),
    );

    expect(["document-0", "bunsetsu-0-1", "bunsetsu-0-2"].map((id) => rowOf(host, id))).toEqual([
      183, 196, 300,
    ]);
    expect(block(host, "bunsetsu-0-1")).toEqual({ primary: "-18", gloss: [], ruby: ["-33"] });
    expect(block(host, "bunsetsu-0-2").primary).toBe("24.5");
  });

  it("hangs a middle child one step below when the link to the first child crosses above and its own link grazes below", () => {
    const host = render(
      scaffold("document-0", "document", [
        bunsetsu("bunsetsu-0-0", "", 1),
        bunsetsu("bunsetsu-0-1", "", 1),
        bunsetsu("bunsetsu-0-2", "", 2),
      ]),
    );

    expect(["bunsetsu-0-0", "bunsetsu-0-1", "document-0"].map((id) => rowOf(host, id))).toEqual([
      40, 144, 157,
    ]);
    expect(block(host, "bunsetsu-0-1")).toEqual({ primary: "36.5", gloss: [], ruby: ["21.5"] });
    expect(fallbacks(host)).toBe("0");
  });

  it("keeps the first pass's spot and counts the fallback when the second pass finds none free", () => {
    const narrow = render(
      scaffold("document-0", "document", [
        bunsetsu("bunsetsu-0-0", "", 1),
        bunsetsu("bunsetsu-0-1", "", 1),
        bunsetsu("bunsetsu-0-2", "", 1),
      ]),
    );
    expect(block(narrow, "bunsetsu-0-1").primary).toBe("24.5");
    expect(fallbacks(narrow)).toBe("0");

    const grazed = render(
      scaffold("document-0", "document", [
        {
          ...bunsetsu("bunsetsu-0", "", 0),
          children: [
            {
              ...bunsetsu("bunsetsu-0-0", "", 0),
              children: [
                token("token-0"),
                { ...bunsetsu("bunsetsu-0-0-1", "to go", 1), primaryLabel: "行か" },
                token("token-2"),
              ],
            },
          ],
        },
      ]),
    );
    expect(["bunsetsu-0-0", "bunsetsu-0-0-1"].map((id) => rowOf(grazed, id))).toEqual([95.75, 99.5]);
    expect(block(grazed, "bunsetsu-0-0-1")).toEqual({ primary: "-18", gloss: ["-5"], ruby: ["-33"] });
    expect(fallbacks(grazed)).toBe("1");
  });

  it("bends the link to the last child level past a long middle label and leaves the link to the first child d3's cubic", () => {
    const host = render(
      scaffold("document-0", "document", [
        bunsetsu("bunsetsu-0-0", "", 1),
        { ...bunsetsu("bunsetsu-0-1", "please do not go there", 1), primaryLabel: "行かないでください" },
        bunsetsu("bunsetsu-0-2", "", 1),
      ]),
    );

    expect(
      [...host.querySelectorAll("path.graph-link")].slice(0, 3).map((path) => path.getAttribute("d")),
    ).toEqual([
      "M0,144C98,144,98,40,196,40",
      "M0,144C98,144,98,144,196,144",
      "M0,144C21,144,21,248,42,248L196,248",
    ]);
    expect(block(host, "bunsetsu-0-1")).toEqual({ primary: "24.5", gloss: ["37.5"], ruby: ["9.5"] });
    expect(fallbacks(host)).toBe("0");
  });

  it("records each hanging label's side and nudges on its node", () => {
    const host = render(
      scaffold("document-0", "document", [
        bunsetsu("bunsetsu-0-0", "", 1),
        bunsetsu("bunsetsu-0-1", "", 1),
        bunsetsu("bunsetsu-0-2", "", 2),
      ]),
    );
    const placement = (id: string) => {
      const group = host.querySelector(`#graph-node-${id}`);
      return [group?.getAttribute("data-label-side"), group?.getAttribute("data-label-nudges")];
    };

    expect(placement("bunsetsu-0-0")).toEqual(["above", "0"]);
    expect(placement("bunsetsu-0-1")).toEqual(["below", "1"]);
    expect(placement("bunsetsu-0-2-token-0")).toEqual([null, null]);
  });

  it("drops a below label until a ruby overhanging its end clears the hover circle", () => {
    const hon: RubyRun[] = [{ start: 0, length: 1, reading: "ほん" }];
    const host = render(
      scaffold("document-0", "document", [
        bunsetsu("bunsetsu-0-0", "", 1),
        {
          id: "bunsetsu-0-1",
          kind: "bunsetsu",
          primaryLabel: "本",
          ruby: hon,
          secondaryLabel: "book",
          children: [{ ...token("token-1"), primaryLabel: "本", ruby: hon }],
        },
      ]),
    );

    // ほん is estimated 14 wide over a 12 wide 本 ending at -10, so its corner
    // sits at x = -9 and must drop to y = sqrt(10² - 9²).
    expect(rubyAttributes(host, "bunsetsu-0-1", "x")).toEqual(["-16"]);
    expect(block(host, "bunsetsu-0-1")).toEqual({
      primary: "26.358898943540673",
      gloss: ["39.35889894354067"],
      ruby: ["11.358898943540673"],
    });
  });

  it("parts a label hung below from the next cousin's label above by both blocks", () => {
    const host = render(
      scaffold("document-0", "document", [
        scaffold("sentence-0", "sentence", [
          bunsetsu("bunsetsu-0-0", "to go", 1),
          bunsetsu("bunsetsu-0-1", "to go", 1),
        ]),
        scaffold("sentence-1", "sentence", [
          bunsetsu("bunsetsu-1-0", "to go", 1),
          bunsetsu("bunsetsu-1-1", "to go", 1),
        ]),
      ]),
    );

    expect(block(host, "bunsetsu-0-1").primary).toBe("24.5");
    expect(block(host, "bunsetsu-1-0").primary).toBe("-18");
    expect(rowOf(host, "bunsetsu-1-0") - rowOf(host, "bunsetsu-0-1")).toBe(134);
  });

  it("lays out the hanbaiki fixture", () => {
    const host = render(buildGraphModel(AnalysisDocument.parse(hanbaiki)));
    const placed = [...host.querySelectorAll("g.graph-node")].map((group) => [
      group.id.replace("graph-node-", ""),
      group.getAttribute("transform"),
      group.querySelector(".graph-primary-label")?.getAttribute("dy") ?? null,
      group.querySelector(".graph-secondary-label tspan")?.getAttribute("y") ?? null,
    ]);

    expect(placed).toEqual([
      ["document-0", "translate(0,222)", null, null],
      ["bunsetsu-0-0", "translate(208,66)", "-42", "-29"],
      ["bunsetsu-0-1", "translate(208,222)", "-30", "-17"],
      ["bunsetsu-0-2", "translate(208,378)", "-18", null],
      ["word-0-2", "translate(260,40)", "4.2", "15"],
      ["token-3", "translate(260,92)", "4.2", "15"],
      ["token-4", "translate(260,196)", "4.2", "15"],
      ["token-5", "translate(260,248)", "4.2", "15"],
      ["token-6", "translate(260,352)", "4.2", "15"],
      ["token-7", "translate(260,404)", "4.2", "15"],
    ]);
    expect(
      [...host.querySelectorAll("path.graph-link")].slice(0, 3).map((path) => path.getAttribute("d")),
    ).toEqual([
      "M0,222C104,222,104,66,208,66",
      "M0,222C104,222,104,222,208,222",
      "M0,222C104,222,104,378,208,378",
    ]);
    expect(fallbacks(host)).toBe("0");
  });
});
