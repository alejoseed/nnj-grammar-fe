// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  generateAnalysisTypes,
  OUTPUT_PATH,
  SCHEMA_PATH,
} from "../tools/codegen/analysis-types";

describe("generated analysis types", () => {
  it("match the backend's committed JSON Schema; run `npm run gen:types`", () => {
    expect(readFileSync(OUTPUT_PATH, "utf8")).toBe(
      generateAnalysisTypes(readFileSync(SCHEMA_PATH, "utf8")),
    );
  });
});
