// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import fixture from "../../nnj-grammar/tests/fixtures/analysis-soshite.json";
import { AnalysisDocument } from "../src/types";

const fixtureDirectory = new URL("../../nnj-grammar/tests/fixtures/", import.meta.url);
const fixtureFiles = readdirSync(fixtureDirectory)
  .filter((file) => file.endsWith(".json"))
  .sort();

describe("AnalysisDocument", () => {
  it("finds the committed backend fixtures", () => {
    expect(fixtureFiles).toEqual(
      expect.arrayContaining(["analysis-hanbaiki.json", "analysis-soshite.json"]),
    );
  });

  // Parsing strips keys the schema doesn't know, so equality also catches a
  // backend field the schema is missing.
  it.each(fixtureFiles)("covers every field of the committed fixture %s", (file) => {
    const committed: object = JSON.parse(
      readFileSync(new URL(file, fixtureDirectory), "utf8"),
    );
    expect(AnalysisDocument.parse(committed)).toEqual(committed);
  });

  it("accepts a version 3 document from a backend that predates furigana", () => {
    const legacy = structuredClone(AnalysisDocument.parse(fixture));
    for (const token of legacy.tokens) {
      delete token.furigana;
    }
    expect(AnalysisDocument.parse(legacy)).toEqual(legacy);
  });

  it.each([2, 4])("rejects schema version %i", (schema_version) => {
    expect(() =>
      AnalysisDocument.parse({ ...fixture, schema_version }),
    ).toThrow(ZodError);
  });

  it.each([
    null,
    [],
    { schema_version: 3 },
    { ...fixture, tokens: null },
    { ...fixture, tree: { ...fixture.tree, nodes: [{ id: "n", kind: "phrase" }] } },
    { ...fixture, tokens: [{ ...fixture.tokens[0], position: -1 }] },
    { ...fixture, tokens: [{ ...fixture.tokens[0], furigana: [{ reading: null }] }] },
  ])("rejects a malformed document: %j", (value) => {
    expect(() => AnalysisDocument.parse(value)).toThrow(ZodError);
  });
});
