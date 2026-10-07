import { expect, test, type Page } from "@playwright/test";

const SEED = "東京しか行かない";
const FOG = "rgb(90, 100, 120)";
const SHU = "rgb(199, 62, 58)";

interface Squeeze {
  nodeId: string;
  base: string;
  widthOverRun: number;
}

interface Sentence {
  number: number;
  text: string;
  anchor: string;
  rubies: string[];
  squeezes: Squeeze[];
}

const SEED_SENTENCE: Sentence = {
  number: 1,
  text: SEED,
  anchor: "東京しか",
  rubies: [
    "東京しか 東京[とうきょう]",
    "東京 東京[とうきょう]",
    "行かない 行[い]",
    "行か 行[い]",
  ],
  squeezes: [
    { nodeId: "bunsetsu-0-0", base: "東京", widthOverRun: 6 },
    { nodeId: "token-0", base: "東京", widthOverRun: 6 },
  ],
};

const SENTENCE_8: Sentence = {
  number: 8,
  text: "3月に行きます",
  anchor: "3月に",
  rubies: ["3月に 月[がつ]", "月 月[がつ]", "行きます 行[い]", "行き 行[い]"],
  squeezes: [],
};

const SENTENCES: Sentence[] = [
  SEED_SENTENCE,
  {
    number: 2,
    text: "自動販売機で水を買った",
    anchor: "自動販売機で",
    rubies: [
      "自動販売機で 自動[じどう]",
      "自動販売機で 販売[はんばい]",
      "自動販売機で 機[き]",
      "自動販売機 自動[じどう]",
      "自動販売機 販売[はんばい]",
      "自動販売機 機[き]",
      "水を 水[みず]",
      "水 水[みず]",
      "買った 買[か]",
      "買っ 買[か]",
    ],
    squeezes: [
      { nodeId: "bunsetsu-0-0", base: "販売", widthOverRun: 0 },
      { nodeId: "word-0-2", base: "販売", widthOverRun: 0 },
    ],
  },
  {
    number: 3,
    text: "取り消した美しい絵",
    anchor: "取り消した",
    rubies: [
      "取り消した 取[と]",
      "取り消した 消[け]",
      "取り消し 取[と]",
      "取り消し 消[け]",
      "美しい 美[うつく]",
      "美しい 美[うつく]",
      "絵 絵[え]",
      "絵 絵[え]",
    ],
    squeezes: [],
  },
  {
    number: 4,
    text: "来た",
    anchor: "来た",
    rubies: ["来た 来[き]", "来 来[き]"],
    squeezes: [],
  },
  {
    number: 5,
    text: "承る",
    anchor: "承る",
    rubies: ["承る 承[うけたまわ]", "承る 承[うけたまわ]"],
    squeezes: [
      { nodeId: "bunsetsu-0-0", base: "承", widthOverRun: 6 },
      { nodeId: "token-0", base: "承", widthOverRun: 6 },
    ],
  },
  {
    number: 6,
    text: "一ヶ月",
    anchor: "一ヶ月",
    rubies: [
      "一ヶ月 一[いち]",
      "一ヶ月 一[いち]",
      "一ヶ月 ヶ月[かげつ]",
      "一ヶ月 ヶ月[かげつ]",
    ],
    squeezes: [
      { nodeId: "bunsetsu-0-0", base: "一", widthOverRun: 0 },
      { nodeId: "word-0-1", base: "一", widthOverRun: 0 },
    ],
  },
  {
    number: 7,
    text: "コーヒーを飲む",
    anchor: "コーヒーを",
    rubies: ["飲む 飲[の]", "飲む 飲[の]"],
    squeezes: [],
  },
  SENTENCE_8,
  {
    number: 9,
    text: "何の本",
    anchor: "何の",
    rubies: ["何の 何[なん]", "何 何[なん]", "本 本[ほん]", "本 本[ほん]"],
    squeezes: [],
  },
  {
    number: 10,
    text: "彼は走って帰った",
    anchor: "彼は",
    rubies: [
      "彼は 彼[かれ]",
      "彼 彼[かれ]",
      "走って 走[はし]",
      "走っ 走[はし]",
      "帰った 帰[かえ]",
      "帰っ 帰[かえ]",
    ],
    squeezes: [],
  },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlacedText {
  nodeId: string;
  role: string;
  content: string;
  client: Box;
}

interface MeasuredRuby {
  textIndex: number;
  nodeId: string;
  label: string;
  base: string;
  reading: string;
  start: number;
  length: number;
  textLength: string | null;
  box: Box;
  client: Box;
  runLeft: number;
  runRight: number;
  labelBox: Box;
  fill: string;
  fontSize: string;
  fontStyle: string;
}

interface GraphMeasurement {
  texts: PlacedText[];
  rubies: MeasuredRuby[];
}

/** Runs in the page, so it may not reference anything outside its body. */
function measureGraph(): GraphMeasurement {
  const toBox = (rect: DOMRect): Box => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  const nodeOf = (text: SVGTextElement): SVGGElement => {
    const group = text.closest<SVGGElement>("g.graph-node");
    if (!group) {
      throw new Error(`text "${text.textContent}" is outside every g.graph-node`);
    }

    return group;
  };
  const nodeIdOf = (text: SVGTextElement): string =>
    nodeOf(text).id.replace(/^graph-node-/, "");
  const texts = [
    ...document.querySelectorAll<SVGTextElement>("svg[role=tree] g.graph-node text"),
  ];

  return {
    texts: texts.map((text) => ({
      nodeId: nodeIdOf(text),
      role: text.getAttribute("class")?.split(" ")[0] ?? "",
      content: text.textContent ?? "",
      client: toBox(text.getBoundingClientRect()),
    })),
    rubies: texts.flatMap((ruby, textIndex) => {
      if (!ruby.classList.contains("graph-ruby")) {
        return [];
      }
      const nodeId = nodeIdOf(ruby);
      const primary = nodeOf(ruby).querySelector<SVGTextElement>(
        "text.graph-primary-label",
      );
      if (!primary) {
        throw new Error(`${nodeId} has a ruby but no primary label`);
      }
      const label = primary.textContent ?? "";
      const start = Number(ruby.dataset.rubyStart);
      const length = Number(ruby.dataset.rubyLength);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(length) ||
        length < 1 ||
        start < 0 ||
        start + length > label.length
      ) {
        throw new Error(
          `${nodeId} ruby "${ruby.textContent}" has run ${ruby.dataset.rubyStart}+${ruby.dataset.rubyLength} outside label "${label}"`,
        );
      }
      const style = getComputedStyle(ruby);

      return [
        {
          textIndex,
          nodeId,
          label,
          base: label.slice(start, start + length),
          reading: ruby.textContent ?? "",
          start,
          length,
          textLength: ruby.getAttribute("textLength"),
          box: toBox(ruby.getBBox()),
          client: toBox(ruby.getBoundingClientRect()),
          runLeft: primary.getStartPositionOfChar(start).x,
          runRight: primary.getEndPositionOfChar(start + length - 1).x,
          labelBox: toBox(primary.getBBox()),
          fill: style.fill,
          fontSize: style.fontSize,
          fontStyle: style.fontStyle,
        },
      ];
    }),
  };
}

interface Subject {
  where: string;
  numbers: string;
}

interface Observation {
  predicate: string;
  where: string;
  measured: number;
  bound: string;
  slack: number;
}

const observations: Observation[] = [];

function px(value: number): string {
  return value.toFixed(2);
}

function boxText(box: Box): string {
  return `x=${px(box.x)} y=${px(box.y)} w=${px(box.width)} h=${px(box.height)}`;
}

function circleDistance(box: Box): number {
  const dx = Math.max(box.x, 0, -(box.x + box.width));
  const dy = Math.max(box.y, 0, -(box.y + box.height));

  return Math.hypot(dx, dy);
}

function subjectOf(sentence: Sentence, ruby: MeasuredRuby): Subject {
  return {
    where: `sentence ${sentence.number} ${sentence.text}, node ${ruby.nodeId} "${ruby.label}", ${ruby.base}[${ruby.reading}]`,
    numbers: [
      `ruby box ${boxText(ruby.box)}`,
      `textLength ${ruby.textLength ?? "unset"}`,
      `run ${px(ruby.runLeft)}..${px(ruby.runRight)} (width ${px(ruby.runRight - ruby.runLeft)})`,
      `label box ${boxText(ruby.labelBox)}`,
      `circle distance ${px(circleDistance(ruby.box))}`,
    ].join("; "),
  };
}

function expectAtMost(
  predicate: string,
  subject: Subject,
  measured: number,
  bound: number,
): void {
  observations.push({
    predicate,
    where: subject.where,
    measured,
    bound: `<= ${px(bound)}`,
    slack: bound - measured,
  });
  expect
    .soft(
      measured,
      `${predicate}, ${subject.where}: ${px(measured)} must be <= ${px(bound)} (over by ${px(measured - bound)}); ${subject.numbers}`,
    )
    .toBeLessThanOrEqual(bound);
}

function expectAtLeast(
  predicate: string,
  subject: Subject,
  measured: number,
  bound: number,
): void {
  observations.push({
    predicate,
    where: subject.where,
    measured,
    bound: `>= ${px(bound)}`,
    slack: measured - bound,
  });
  expect
    .soft(
      measured,
      `${predicate}, ${subject.where}: ${px(measured)} must be >= ${px(bound)} (short by ${px(bound - measured)}); ${subject.numbers}`,
    )
    .toBeGreaterThanOrEqual(bound);
}

function tightestByPredicate(list: Observation[]): Observation[] {
  const tightest = new Map<string, Observation>();
  for (const observation of list) {
    const current = tightest.get(observation.predicate);
    if (!current || observation.slack < current.slack) {
      tightest.set(observation.predicate, observation);
    }
  }

  return [...tightest.values()];
}

function logTightest(heading: string, list: Observation[]): void {
  const lines = tightestByPredicate(list).map(
    (observation) =>
      `  ${observation.predicate}: slack ${px(observation.slack)}px (measured ${px(observation.measured)}, bound ${observation.bound}) at ${observation.where}`,
  );
  console.log([heading, ...lines].join("\n"));
}

function overlap(a: Box, b: Box): number {
  const horizontal =
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const vertical =
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return Math.min(horizontal, vertical);
}

function touches(a: MeasuredRuby, b: MeasuredRuby): boolean {
  return (
    a !== b &&
    a.nodeId === b.nodeId &&
    (a.start + a.length === b.start || b.start + b.length === a.start)
  );
}

function checkGeometry(sentence: Sentence, measurement: GraphMeasurement): void {
  const { rubies, texts } = measurement;
  const byNode = new Map<string, MeasuredRuby[]>();
  for (const ruby of rubies) {
    byNode.set(ruby.nodeId, [...(byNode.get(ruby.nodeId) ?? []), ruby]);
  }

  for (const ruby of rubies) {
    const subject = subjectOf(sentence, ruby);
    const { box, labelBox } = ruby;
    const runWidth = ruby.runRight - ruby.runLeft;
    const siblings = byNode.get(ruby.nodeId) ?? [];
    const allowance = siblings.some((other) => touches(ruby, other)) ? 0 : 3;

    expectAtMost(
      "G1 centered on its run",
      subject,
      Math.abs(box.x + box.width / 2 - (ruby.runLeft + ruby.runRight) / 2),
      0.5,
    );
    expectAtMost(
      "G2 bounded overhang",
      subject,
      box.width,
      runWidth + 2 * allowance + 0.5,
    );
    if (ruby.textLength !== null) {
      expectAtMost(
        "G3 width equals textLength",
        subject,
        Math.abs(box.width - Number(ruby.textLength)),
        0.5,
      );
    }
    expectAtMost(
      "G5 center above label center",
      subject,
      box.y + box.height / 2,
      labelBox.y + labelBox.height / 2 - 9,
    );
    expectAtLeast("G5 top attached to label", subject, box.y, labelBox.y - 12);
    expectAtLeast("G6 clear of hover circle", subject, circleDistance(box), 10);

    let worst = { overlap: Number.NEGATIVE_INFINITY, other: "nothing" };
    texts.forEach((other, index) => {
      if (
        index === ruby.textIndex ||
        (other.nodeId === ruby.nodeId && other.role === "graph-primary-label")
      ) {
        return;
      }
      const amount = overlap(ruby.client, other.client);
      if (amount > worst.overlap) {
        worst = {
          overlap: amount,
          other: `${other.role} "${other.content}" of ${other.nodeId} (client ${boxText(other.client)})`,
        };
      }
    });
    expectAtMost(
      "G7 no collision",
      {
        where: subject.where,
        numbers: `closest text ${worst.other}; ruby client ${boxText(ruby.client)}; ${subject.numbers}`,
      },
      worst.overlap,
      0.5,
    );

    expect
      .soft(
        { fill: ruby.fill, fontSize: ruby.fontSize, fontStyle: ruby.fontStyle },
        `G8 style, ${subject.where}: resting ruby is fog, 7px, upright`,
      )
      .toEqual({ fill: FOG, fontSize: "7px", fontStyle: "normal" });
  }

  for (const squeeze of sentence.squeezes) {
    const ruby = rubies.find(
      (measured) =>
        measured.nodeId === squeeze.nodeId && measured.base === squeeze.base,
    );
    if (!ruby) {
      throw new Error(
        `G3 sentence ${sentence.number}: ${squeeze.nodeId} has no ruby over ${squeeze.base}`,
      );
    }
    const subject = subjectOf(sentence, ruby);
    expect
      .soft(ruby.textLength, `G3 ${subject.where}: textLength is set`)
      .toMatch(/^\d+(\.\d+)?$/);
    expectAtMost(
      `G3 squeezed to run + ${squeeze.widthOverRun}`,
      subject,
      Math.abs(
        ruby.box.width - (ruby.runRight - ruby.runLeft + squeeze.widthOverRun),
      ),
      0.5,
    );
  }

  for (const [nodeId, nodeRubies] of byNode) {
    const ordered = [...nodeRubies].sort((a, b) => a.start - b.start);
    for (let index = 0; index + 1 < ordered.length; index += 1) {
      const left = ordered[index];
      const right = ordered[index + 1];
      expectAtMost(
        "G4 ordered and disjoint",
        {
          where: `sentence ${sentence.number} ${sentence.text}, node ${nodeId} "${left.label}", ${left.base}[${left.reading}] then ${right.base}[${right.reading}]`,
          numbers: `left box ${boxText(left.box)}; right box ${boxText(right.box)}`,
        },
        left.box.x + left.box.width,
        right.box.x + 0.25,
      );
    }
  }
}

/** StrictMode fires the seed request twice. */
function pendingAnalyzeRequests(page: Page): () => number {
  let pending = 0;
  const isAnalyze = (url: string) => url.endsWith("/api/analyze");
  page.on("request", (request) => {
    if (isAnalyze(request.url())) {
      pending += 1;
    }
  });
  const settle = (url: string) => {
    if (isAnalyze(url)) {
      pending -= 1;
    }
  };
  page.on("requestfinished", (request) => settle(request.url()));
  page.on("requestfailed", (request) => settle(request.url()));

  return () => pending;
}

async function showSentence(
  page: Page,
  sentence: Sentence,
): Promise<GraphMeasurement> {
  const where = `sentence ${sentence.number} ${sentence.text}`;
  const pending = pendingAnalyzeRequests(page);
  const tree = page.locator("svg[role=tree]");
  await page.goto("/");
  await expect(
    tree.getByText("東京しか", { exact: true }).first(),
    `${where}: the seed graph renders`,
  ).toBeVisible();
  await expect
    .poll(pending, { message: `${where}: the seed's /api/analyze requests settle` })
    .toBe(0);
  if (sentence.text !== SEED) {
    await page.locator("form input[type=text]").fill(sentence.text);
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
  }
  await expect(
    tree.getByText(sentence.anchor, { exact: true }).first(),
    `${where}: anchor label ${sentence.anchor} renders`,
  ).toBeVisible();
  await expect
    .poll(pending, { message: `${where}: every /api/analyze request settles` })
    .toBe(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect
    .soft(page.locator("text.graph-ruby"), `${where}: one ruby element per expected ruby`)
    .toHaveCount(sentence.rubies.length);
  await tree.screenshot({ path: `test-results/furigana-${sentence.number}.png` });

  return page.evaluate(measureGraph);
}

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/analyze", {
    data: { text: "行かない" },
  });
  expect(response.ok(), `POST /api/analyze answered ${response.status()}`).toBe(
    true,
  );
  const body = await response.json();
  expect(
    body.tokens?.[0]?.furigana,
    "backend on :7878 predates furigana; rebuild and restart nnj-grammar-server from this branch",
  ).toEqual([
    { text: "行", reading: "い" },
    { text: "か", reading: null },
  ]);
});

test.afterAll(() => {
  logTightest(
    "furigana tightest margin per predicate, over every sentence this worker ran:",
    observations,
  );
});

for (const sentence of SENTENCES) {
  test(`sentence ${sentence.number} ${sentence.text}: ruby sits over the right kanji`, async ({
    page,
  }) => {
    const firstObservation = observations.length;
    const measurement = await showSentence(page, sentence);
    const found = measurement.rubies.map(
      (ruby) => `${ruby.label} ${ruby.base}[${ruby.reading}]`,
    );
    expect
      .soft(
        [...found].sort(),
        `sentence ${sentence.number} ${sentence.text}: rubies as "label base[reading]"`,
      )
      .toEqual([...sentence.rubies].sort());
    checkGeometry(sentence, measurement);
    logTightest(
      `furigana sentence ${sentence.number} ${sentence.text}, tightest margin per predicate:`,
      observations.slice(firstObservation),
    );
  });
}

test("sentence 1: hovering token-0 recolors its ruby without bolding it", async ({
  page,
}) => {
  await showSentence(page, SEED_SENTENCE);
  const where = "sentence 1 東京しか行かない, node token-0, 東京[とうきょう]";
  const node = page.locator("#graph-node-token-0");
  const ruby = node.locator("text.graph-ruby");

  await expect(
    page.locator(".graph-secondary-label").first(),
    "G8 sentence 1: a secondary label is fog, the color ruby shares",
  ).toHaveCSS("fill", FOG);
  await expect(ruby, `${where}: token-0 carries one とうきょう ruby`).toHaveText(
    "とうきょう",
  );
  await expect(ruby, `${where}: resting ruby is fog`).toHaveCSS("fill", FOG);

  await node.locator("circle").hover();
  await expect(ruby, `${where}: hovered ruby turns shu`).toHaveCSS("fill", SHU);
  await expect(
    node.locator("text.graph-primary-label"),
    `${where}: hovered primary label turns bold`,
  ).toHaveCSS("font-weight", "700");
  await expect(ruby, `${where}: hovered ruby keeps regular weight`).toHaveCSS(
    "font-weight",
    "400",
  );

  await page.mouse.move(0, 0);
  await expect(ruby, `${where}: ruby returns to fog after the pointer leaves`).toHaveCSS(
    "fill",
    FOG,
  );
});

test("sentence 8: a bold 3月に keeps its ruby centered on 月", async ({ page }) => {
  await showSentence(page, SENTENCE_8);
  const node = page.locator("#graph-node-bunsetsu-0-0");
  const label = node.locator("text.graph-primary-label");
  await expect(label, "sentence 8: bunsetsu-0-0 is the 3月に label").toHaveText("3月に");
  await expect(label, "sentence 8: 3月に is end-anchored").toHaveAttribute(
    "text-anchor",
    "end",
  );

  await node.locator("circle").hover();
  await expect(label, "sentence 8: hovered 3月に turns bold").toHaveCSS(
    "font-weight",
    "700",
  );
  const hovered = await page.evaluate(measureGraph);
  const ruby = hovered.rubies.find((measured) => measured.nodeId === "bunsetsu-0-0");
  if (!ruby) {
    throw new Error("sentence 8: bunsetsu-0-0 lost its ruby on hover");
  }
  expectAtMost(
    "G1 centered on its run while bold",
    subjectOf(SENTENCE_8, ruby),
    Math.abs(ruby.box.x + ruby.box.width / 2 - (ruby.runLeft + ruby.runRight) / 2),
    0.5,
  );
});
