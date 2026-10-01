import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import fixture from "../../nnj-grammar/tests/fixtures/analysis-soshite.json";
import { AnalysisDocument } from "../src/types";

describe("AnalysisDocument", () => {
  // Parsing strips keys the schema doesn't know, so equality also catches a
  // backend field the schema is missing.
  it("covers every field of the committed schema version 3 fixture", () => {
    expect(AnalysisDocument.parse(fixture)).toEqual(fixture);
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
  ])("rejects a malformed document: %j", (value) => {
    expect(() => AnalysisDocument.parse(value)).toThrow(ZodError);
  });
});
