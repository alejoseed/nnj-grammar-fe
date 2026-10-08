import { describe, expect, it } from "vitest";
import { wrapGloss } from "../src/gloss-lines";

const IKU =
  "to go; to move (in a direction or towards a specific location); to head (towards); to be transported (towards); to reach";

describe("wrapGloss", () => {
  it("keeps a gloss of up to 30 characters on one line and drops an empty one", () => {
    expect(wrapGloss("Will/Does/Do (not)")).toEqual(["Will/Does/Do (not)"]);
    expect(wrapGloss("  ")).toEqual([]);
  });

  it("breaks between senses and ends the broken line with the separator", () => {
    expect(wrapGloss("to go; to head (towards); to reach")).toEqual([
      "to go; to head (towards);",
      "to reach",
    ]);
  });

  it("does not break senses at a semicolon inside parentheses", () => {
    expect(wrapGloss("to cancel (an order; a deal); to revoke")).toEqual([
      "to cancel (an order; a deal);",
      "to revoke",
    ]);
  });

  it("word-wraps a sense longer than 30 characters into balanced lines", () => {
    expect(wrapGloss("Formal or literary だ, Authoritative, Copula")).toEqual([
      "Formal or literary だ,",
      "Authoritative, Copula",
    ]);
    expect(
      wrapGloss(
        "Indicates something has not yet happened or is still happening; 'still', 'not yet'.",
      ),
    ).toEqual([
      "Indicates something has not",
      "yet happened or is still",
      "happening; 'still', 'not yet'.",
    ]);
  });

  it("caps at three lines and counts the senses it hides", () => {
    expect(wrapGloss(IKU)).toEqual([
      "to go; to move (in a direction",
      "or towards a specific",
      "location); to head (towards) +2 more",
    ]);
  });

  it("marks a sense the cap cuts short", () => {
    expect(
      wrapGloss(
        "to go; to move (in a direction or towards a specific location, often one far away from where the speaker is)",
      ),
    ).toEqual([
      "to go; to move (in a direction",
      "or towards a specific",
      "location, often one far away…",
    ]);
  });
});
