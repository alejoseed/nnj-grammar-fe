import { describe, expect, it } from "vitest";
import { layoutRuby } from "../src/ruby-layout";

describe("layoutRuby", () => {
  it("squeezes 承 to the run plus 3px per side", () => {
    const run = { start: 0, length: 1, reading: "うけたまわ" };
    expect(layoutRuby([{ run, natural: 35 }], [12, 12])).toEqual([
      { run, natural: 35, center: 6, width: 18, compressed: true },
    ]);
  });

  it("squeezes an all-kanji label's ruby to the label plus 3px per edge", () => {
    const run = { start: 0, length: 2, reading: "とうきょう" };
    expect(layoutRuby([{ run, natural: 35 }], [12, 12])).toEqual([
      { run, natural: 35, center: 12, width: 30, compressed: true },
    ]);
  });

  it("keeps the natural width of a short reading", () => {
    const run = { start: 0, length: 1, reading: "き" };
    expect(layoutRuby([{ run, natural: 7 }], [12])).toEqual([
      { run, natural: 7, center: 6, width: 7, compressed: false },
    ]);
  });

  it("gives touching runs no overhang toward each other", () => {
    const jidou = { start: 0, length: 2, reading: "じどう" };
    const hanbai = { start: 2, length: 2, reading: "はんばい" };
    const ki = { start: 4, length: 1, reading: "き" };
    expect(
      layoutRuby(
        [
          { run: jidou, natural: 21 },
          { run: hanbai, natural: 28 },
          { run: ki, natural: 7 },
        ],
        [12, 12, 12, 12, 12],
      ),
    ).toEqual([
      { run: jidou, natural: 21, center: 12, width: 21, compressed: false },
      { run: hanbai, natural: 28, center: 36, width: 24, compressed: true },
      { run: ki, natural: 7, center: 54, width: 7, compressed: false },
    ]);
  });

  it("splits a kana neighbor shared by two runs", () => {
    const to = { start: 0, length: 1, reading: "と" };
    const ke = { start: 2, length: 1, reading: "け" };
    expect(
      layoutRuby(
        [
          { run: to, natural: 35 },
          { run: ke, natural: 35 },
        ],
        [12, 12, 12, 12],
      ),
    ).toEqual([
      { run: to, natural: 35, center: 6, width: 18, compressed: true },
      { run: ke, natural: 35, center: 30, width: 18, compressed: true },
    ]);
  });

  it("limits overhang to half of a narrow neighbor", () => {
    const tou = { start: 0, length: 1, reading: "とう" };
    const kyou = { start: 2, length: 1, reading: "きょう" };
    expect(
      layoutRuby(
        [
          { run: tou, natural: 21 },
          { run: kyou, natural: 21 },
        ],
        [12, 4, 12, 12],
      ),
    ).toEqual([
      { run: tou, natural: 21, center: 6, width: 16, compressed: true },
      { run: kyou, natural: 21, center: 22, width: 16, compressed: true },
    ]);
  });

  it("does not squeeze a reading exactly at the cap", () => {
    const run = { start: 0, length: 1, reading: "あい" };
    expect(layoutRuby([{ run, natural: 18 }], [12, 12])).toEqual([
      { run, natural: 18, center: 6, width: 18, compressed: false },
    ]);
  });

  it("centers a run that follows a kana prefix", () => {
    const run = { start: 1, length: 1, reading: "ちゃ" };
    expect(layoutRuby([{ run, natural: 14 }], [12, 12])).toEqual([
      { run, natural: 14, center: 18, width: 14, compressed: false },
    ]);
  });

  it("overhangs 3px past the label's last character", () => {
    const nan = { start: 0, length: 1, reading: "なん" };
    const hon = { start: 2, length: 1, reading: "ほん" };
    expect(
      layoutRuby(
        [
          { run: nan, natural: 18 },
          { run: hon, natural: 20 },
        ],
        [12, 12, 12],
      ),
    ).toEqual([
      { run: nan, natural: 18, center: 6, width: 18, compressed: false },
      { run: hon, natural: 20, center: 30, width: 18, compressed: true },
    ]);
  });
});
