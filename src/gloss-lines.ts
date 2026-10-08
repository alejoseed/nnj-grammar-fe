const TARGET_LINE_CHARS = 30;
const WIDOW_CHARS = TARGET_LINE_CHARS / 4;
const MAX_LINES = 3;

interface Unit {
  text: string;
  sense: number;
}

function splitSenses(gloss: string): string[] {
  const senses: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < gloss.length; index += 1) {
    const character = gloss[index];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    } else if (character === ";" && depth === 0 && gloss[index + 1] === " ") {
      senses.push(gloss.slice(start, index));
      start = index + 2;
    }
  }
  senses.push(gloss.slice(start));
  return senses.flatMap((sense) => (sense.trim() === "" ? [] : [sense.trim()]));
}

function unitsOf(senses: string[]): Unit[] {
  return senses.flatMap((text, sense) =>
    text.length > TARGET_LINE_CHARS
      ? text.split(" ").flatMap((word) => (word === "" ? [] : [{ text: word, sense }]))
      : [{ text, sense }],
  );
}

function joinUnits(units: readonly Unit[]): string {
  return units
    .map((unit, index) => {
      const previous = units[index - 1];
      if (!previous) {
        return unit.text;
      }
      return `${previous.sense === unit.sense ? " " : "; "}${unit.text}`;
    })
    .join("");
}

function lineText(units: readonly Unit[], next: Unit | undefined): string {
  const last = units.at(-1);
  const endsSense = next !== undefined && last !== undefined && next.sense !== last.sense;
  return joinUnits(units) + (endsSense ? ";" : "");
}

function balancedLines(units: readonly Unit[], count: number): Unit[][] {
  const total = units.length;
  const mean = joinUnits(units).length / count;
  const cost = Array.from({ length: count + 1 }, () =>
    Array.from({ length: total + 1 }, () => Number.POSITIVE_INFINITY),
  );
  const start = Array.from({ length: count + 1 }, () =>
    Array.from({ length: total + 1 }, () => 0),
  );
  cost[0]![0] = 0;
  for (let line = 1; line <= count; line += 1) {
    for (let end = line; end <= total; end += 1) {
      for (let from = line - 1; from < end; from += 1) {
        const length = lineText(units.slice(from, end), units[end]).length;
        const candidate = cost[line - 1]![from]! + (length - mean) ** 2;
        if (candidate < cost[line]![end]!) {
          cost[line]![end] = candidate;
          start[line]![end] = from;
        }
      }
    }
  }
  const lines: Unit[][] = [];
  let end = total;
  for (let line = count; line > 0; line -= 1) {
    const from = start[line]![end]!;
    lines.unshift(units.slice(from, end));
    end = from;
  }
  return lines;
}

function lineTexts(lines: readonly Unit[][]): string[] {
  return lines.map((line, index) => lineText(line, lines[index + 1]?.[0]));
}

export function wrapGloss(gloss: string): string[] {
  const trimmed = gloss.trim();
  if (trimmed === "") {
    return [];
  }
  const senses = splitSenses(trimmed);
  const units = unitsOf(senses);
  let count = Math.min(units.length, Math.ceil(joinUnits(units).length / TARGET_LINE_CHARS));
  let lines = balancedLines(units, count);
  while (count > 1 && lineTexts(lines).some((text) => text.length < WIDOW_CHARS)) {
    count -= 1;
    lines = balancedLines(units, count);
  }

  if (lines.length <= MAX_LINES) {
    return lineTexts(lines);
  }
  const kept = lines.slice(0, MAX_LINES);
  const lastKept = kept.at(-1)!;
  const lastUnit = lastKept.at(-1)!;
  const cutsSense = lines[MAX_LINES]![0]!.sense === lastUnit.sense;
  const hidden = senses.length - lastUnit.sense - 1;
  const tail = `${joinUnits(lastKept)}${cutsSense ? "…" : ""}${hidden > 0 ? ` +${hidden} more` : ""}`;
  return [...lineTexts(kept).slice(0, -1), tail];
}
