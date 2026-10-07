import type { RubyRun } from "./graph-model";

export const RUBY_OVERHANG_PX = 3;

export interface MeasuredRun {
  run: RubyRun;
  /** The reading's width before any squeeze. */
  natural: number;
}

export interface RubyPlacement {
  /** Measured from the label's left edge, whatever the label's text-anchor. */
  center: number;
  width: number;
  compressed: boolean;
}

export function layoutRuby<Measured extends MeasuredRun>(
  measured: readonly Measured[],
  advances: readonly number[],
): Array<Measured & RubyPlacement> {
  const prefix = [0];
  for (const advance of advances) {
    prefix.push((prefix.at(-1) ?? 0) + advance);
  }
  const offset = (index: number): number => prefix[index] ?? prefix.at(-1) ?? 0;

  const sideAllowance = (touchesRun: boolean, neighborIndex: number): number => {
    if (touchesRun) {
      return 0;
    }
    const neighbor = advances[neighborIndex];
    return neighbor === undefined ? RUBY_OVERHANG_PX : Math.min(RUBY_OVERHANG_PX, neighbor / 2);
  };

  return measured.map((item, index) => {
    const { run, natural } = item;
    const end = run.start + run.length;
    const left = offset(run.start);
    const right = offset(end);
    const before = measured[index - 1]?.run;
    const after = measured[index + 1]?.run;
    const overhang = Math.min(
      sideAllowance(
        before !== undefined && before.start + before.length === run.start,
        run.start - 1,
      ),
      sideAllowance(after !== undefined && after.start === end, end),
    );
    const cap = right - left + 2 * overhang;
    return {
      ...item,
      center: (left + right) / 2,
      width: Math.min(natural, cap),
      compressed: natural > cap,
    };
  });
}
