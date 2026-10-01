import { describe, expect, it } from "vitest";
import { tagD3Sources } from "../tools/vite/d3-source";

describe("tagD3Sources", () => {
  it("tags D3 appends and joins with their source location", () => {
    const code = [
      'import * as d3 from "d3";',
      "plot",
      '  .join("g")',
      '  .append("circle");',
    ].join("\n");

    expect(tagD3Sources(code, "/src/graph.ts")?.toString()).toBe(
      [
        'import * as d3 from "d3";',
        "plot",
        '  .join("g").attr("data-tsd-source", "/src/graph.ts:3:4")',
        '  .append("circle").attr("data-tsd-source", "/src/graph.ts:4:4");',
      ].join("\n"),
    );
  });

  it("leaves files that do not import d3 alone", () => {
    expect(tagD3Sources('parts.join("g");', "/src/app.ts")).toBeUndefined();
  });
});
