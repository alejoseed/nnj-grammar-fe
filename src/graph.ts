import * as d3 from "d3";
import { wrapGloss } from "./gloss-lines";
import type { GraphNode, RubyRun } from "./graph-model";
import { OccupancyGrid, type Point, type Rect } from "./occupancy";
import { layoutRuby, type MeasuredRun } from "./ruby-layout";

const DESKTOP_WIDTH = 1200;
const DESKTOP_HEIGHT = 800;
const MOBILE_BREAKPOINT = 640;
const MOBILE_ROOT_X = 48;
const VERTICAL_NODE_GAP = 52;
const HORIZONTAL_LABEL_GAP = 32;
const NODE_TOP = 40;
const MARGIN = { top: 20, left: 200 };
const PRIMARY_FONT_PX = 12;
const GLOSS_FONT_PX = 10;
const GLOSS_LINE_PX = 1.2 * GLOSS_FONT_PX;
const GLOSS_UNDER_LABEL_PX = 1.5 * PRIMARY_FONT_PX - GLOSS_FONT_PX / 2;
const RUBY_FONT_PX = 7;
const HOVER_RADIUS_PX = 10;
const LINK_STROKE_PX = 1.5;
// How far the ruby baseline sits above the label baseline. It is the label's
// ascent plus the ruby's descent, so the ruby's font box rests on the label's.
// Chromium's default CJK fallback measures 12.2px and 3.1px at 12px and 7px.
const RUBY_RISE_PX = 15;
const LABEL_CLEARANCE_PX = 2;
// An above label's gloss descends to a quarter gloss em over the center line,
// where the node's links attach. A below label's first line keeps the same
// distance under it.
const CENTER_LINE_CLEARANCE_PX = GLOSS_FONT_PX / 4;
const GRID_CELL_PX = 2;
const GRID_PADDING_PX = 1;
const NUDGE_PX = 12;
const MAX_NUDGES = 2;

const EMPHASIS_COLOR = "var(--color-shu)";

type TreeNode = d3.HierarchyNode<GraphNode>;
type PointNode = d3.HierarchyPointNode<GraphNode>;
type NodeSelection = d3.Selection<SVGGElement, TreeNode, d3.BaseType, unknown>;
type HangingSide = "above" | "below";
type Placement = { side: "right" } | { side: HangingSide; nudges: number };

const RIGHT: Placement = { side: "right" };
const HANGING_SIDES: HangingSide[] = ["above", "below"];
const HANGING_CANDIDATES: Placement[] = Array.from({ length: MAX_NUDGES + 1 }, (_, nudges) =>
  HANGING_SIDES.map((side) => ({ side, nudges })),
).flat();

interface Span {
  left: number;
  right: number;
}

/** Each drawn line's horizontal extent, relative to the node's center. */
interface MeasuredLabel {
  primary: Span;
  /** Top to bottom. */
  gloss: Span[];
  ruby: Span | null;
}

interface Reach {
  top: number;
  bottom: number;
}

interface LabelBlock extends Reach {
  primaryY: number;
  firstGlossY: number;
  /** One per drawn line, relative to the node's center. */
  rects: Rect[];
}

interface Layout {
  root: PointNode;
  at: (point: PointNode) => Point;
}

interface PlacedLabels {
  placements: Map<TreeNode, Placement>;
  /** Nodes whose second pass found no free spot and kept the first pass's. */
  fallbacks: number;
}

const HOVER_REACH: Reach = { top: -HOVER_RADIUS_PX, bottom: HOVER_RADIUS_PX };

function descent(fontPx: number): number {
  return fontPx / 4;
}

function glossLift(glossLines: number): number {
  return GLOSS_LINE_PX * Math.max(0, glossLines - 1);
}

function primaryBaseline(placement: Placement, label: MeasuredLabel): number {
  switch (placement.side) {
    case "above":
      return -1.5 * PRIMARY_FONT_PX - glossLift(label.gloss.length) - NUDGE_PX * placement.nudges;
    case "below": {
      const { ruby } = label;
      // A ruby can overhang its label's end under the hover circle, so the
      // block drops until the ruby's corner clears the circle.
      const corner = ruby ? Math.sqrt(Math.max(0, HOVER_RADIUS_PX ** 2 - ruby.right ** 2)) : 0;
      const firstLine = ruby ? RUBY_RISE_PX + RUBY_FONT_PX : PRIMARY_FONT_PX;
      return Math.max(CENTER_LINE_CLEARANCE_PX, corner) + firstLine + NUDGE_PX * placement.nudges;
    }
    case "right":
      // 35 / 100 rather than 0.35 keeps the attribute "4.2", not 4.199999999999999.
      return (35 * PRIMARY_FONT_PX) / 100;
  }
}

function row(span: Span, baseline: number, fontPx: number): Rect {
  return { ...span, top: baseline - fontPx, bottom: baseline + descent(fontPx) };
}

function labelBlock(placement: Placement, label: MeasuredLabel): LabelBlock {
  const primaryY = primaryBaseline(placement, label);
  const firstGlossY =
    placement.side === "right" ? 1.5 * GLOSS_FONT_PX : primaryY + GLOSS_UNDER_LABEL_PX;
  const { primary, gloss, ruby } = label;
  const rects = [
    row(primary, primaryY, PRIMARY_FONT_PX),
    ...gloss.map((line, index) => row(line, firstGlossY + GLOSS_LINE_PX * index, GLOSS_FONT_PX)),
  ];
  if (ruby) {
    rects.push(row(ruby, primaryY - RUBY_RISE_PX, RUBY_FONT_PX));
  }
  return {
    primaryY,
    firstGlossY,
    rects,
    top: Math.min(-HOVER_RADIUS_PX, ...rects.map((rect) => rect.top)),
    bottom: Math.max(HOVER_RADIUS_PX, ...rects.map((rect) => rect.bottom)),
  };
}

/** The points of d3.linkHorizontal's cubic, at most `step` apart. */
export function sampleLink(source: Point, target: Point, step: number): Point[] {
  const middle = (source.x + target.x) / 2;
  // A cubic's speed never exceeds three times its longest control leg.
  const longestLeg = Math.max(Math.abs(target.x - source.x) / 2, Math.abs(target.y - source.y));
  const segments = Math.max(1, Math.ceil((3 * longestLeg) / step));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const u = 1 - t;
    return {
      x: u ** 3 * source.x + 3 * u * t * middle + t ** 3 * target.x,
      y: (u ** 3 + 3 * u ** 2 * t) * source.y + (3 * u * t ** 2 + t ** 3) * target.y,
    };
  });
}

function shifted(rect: Rect, by: Point): Rect {
  return {
    left: rect.left + by.x,
    top: rect.top + by.y,
    right: rect.right + by.x,
    bottom: rect.bottom + by.y,
  };
}

function distanceToRect(point: Point, rect: Rect): number {
  return Math.hypot(
    Math.max(rect.left - point.x, 0, point.x - rect.right),
    Math.max(rect.top - point.y, 0, point.y - rect.bottom),
  );
}

function textFontPx(text: SVGTextContentElement): number {
  const attribute = Number(text.getAttribute("font-size"));
  if (attribute > 0) {
    return attribute;
  }
  const match = /\btext-\[(\d+(?:\.\d+)?)px\]/.exec(
    text.getAttribute("class") ?? "",
  );
  return match ? Number(match[1]) : PRIMARY_FONT_PX;
}

function estimatedAdvances(label: string, fontPx: number): number[] {
  return Array.from({ length: label.length }, (_, index) => {
    const code = label.charCodeAt(index);
    // A low surrogate is the second half of the character before it.
    if (code >= 0xdc00 && code <= 0xdfff) {
      return 0;
    }
    const halfwidthKatakana = code >= 0xff61 && code <= 0xff9f;
    const wide =
      (code >= 0x3000 && code <= 0x30ff) ||
      (code >= 0x3400 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef && !halfwidthKatakana) ||
      (code >= 0xd800 && code <= 0xdbff);
    return wide ? fontPx : fontPx * 0.6;
  });
}

function characterAdvances(text: SVGTextElement): number[] {
  const label = text.textContent ?? "";
  try {
    return Array.from({ length: label.length }, (_, index) =>
      text.getSubStringLength(index, 1),
    );
  } catch {
    // jsdom does not implement SVG text measurement.
    return estimatedAdvances(label, textFontPx(text));
  }
}

function measuredTextWidth(
  text: SVGTextContentElement,
  fontPx = textFontPx(text),
): number {
  const fixed = Number(text.getAttribute("textLength"));
  if (fixed > 0) {
    return fixed;
  }
  try {
    const width = text.getComputedTextLength();
    if (Number.isFinite(width) && width > 0) {
      return width;
    }
  } catch {
    // jsdom does not implement SVG text measurement.
  }

  return estimatedAdvances(text.textContent ?? "", fontPx).reduce(
    (total, advance) => total + advance,
    0,
  );
}

function textLeft(text: SVGTextElement, width: number): number {
  const x = Number(text.getAttribute("x") ?? 0);
  const anchor = text.getAttribute("text-anchor");
  if (anchor === "end") {
    return x - width;
  }
  return anchor === "middle" ? x - width / 2 : x;
}

export function placeRuby(group: SVGGElement): void {
  const primary = group.querySelector<SVGTextElement>("text.graph-primary-label");
  const measured: Array<MeasuredRun & { element: SVGTextElement }> = [];
  d3.select(group)
    .selectAll<SVGTextElement, RubyRun>("text.graph-ruby")
    .each(function (run) {
      this.removeAttribute("textLength");
      this.removeAttribute("lengthAdjust");
      measured.push({ element: this, run, natural: measuredTextWidth(this) });
    });
  if (!primary || measured.length === 0) {
    return;
  }
  const advances = characterAdvances(primary);
  const labelLeft = textLeft(
    primary,
    advances.reduce((total, advance) => total + advance, 0),
  );
  const baseline = Number(primary.getAttribute("dy")) - RUBY_RISE_PX;
  const placements = layoutRuby(measured, advances);
  for (const { element, center, width, compressed } of placements) {
    element.setAttribute("x", String(labelLeft + center));
    element.setAttribute("y", String(baseline));
    if (compressed) {
      element.setAttribute("textLength", String(width));
      element.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
  }
}

function spanOf(text: SVGTextElement, width: number): Span {
  const left = textLeft(text, width);
  return { left, right: left + width };
}

function union(spans: readonly Span[]): Span {
  return {
    left: Math.min(...spans.map((span) => span.left)),
    right: Math.max(...spans.map((span) => span.right)),
  };
}

function measureLabel(group: SVGGElement): MeasuredLabel | null {
  const primary = group.querySelector<SVGTextElement>("text.graph-primary-label");
  if (!primary) {
    return null;
  }
  const gloss = group.querySelector<SVGTextElement>("text.graph-secondary-label");
  const glossPx = gloss ? textFontPx(gloss) : GLOSS_FONT_PX;
  const rubies = Array.from(group.querySelectorAll<SVGTextElement>("text.graph-ruby"), (ruby) =>
    spanOf(ruby, measuredTextWidth(ruby)),
  );
  return {
    primary: spanOf(primary, measuredTextWidth(primary)),
    gloss: gloss
      ? Array.from(gloss.querySelectorAll<SVGTSpanElement>("tspan"), (line) =>
          spanOf(gloss, measuredTextWidth(line, glossPx)),
        )
      : [],
    ruby: rubies.length > 0 ? union(rubies) : null,
  };
}

function depthExtents(
  nodes: readonly TreeNode[],
  labels: ReadonlyMap<TreeNode, MeasuredLabel>,
): Map<number, Span> {
  const extents = new Map<number, Span>();
  for (const node of nodes) {
    const spans: Span[] = [{ left: -HOVER_RADIUS_PX, right: HOVER_RADIUS_PX }];
    const label = labels.get(node);
    if (label) {
      spans.push(label.primary, ...label.gloss);
      if (label.ruby) {
        spans.push(label.ruby);
      }
    }
    const extent = extents.get(node.depth);
    extents.set(node.depth, union(extent ? [extent, ...spans] : spans));
  }
  return extents;
}

function placeDepthColumns(extents: Map<number, Span>, maximumDepth: number): number[] {
  const columns = [0];
  let furthestRight = extents.get(0)?.right ?? HOVER_RADIUS_PX;

  for (let depth = 1; depth <= maximumDepth; depth += 1) {
    const extent = extents.get(depth) ?? { left: -HOVER_RADIUS_PX, right: HOVER_RADIUS_PX };
    const position = furthestRight + HORIZONTAL_LABEL_GAP - extent.left;
    columns.push(position);
    furthestRight = Math.max(furthestRight, position + extent.right);
  }

  return columns;
}

function layOut(
  hierarchy: TreeNode,
  columns: readonly number[],
  reach: (node: TreeNode) => Reach,
): Layout {
  const breadthFirst = hierarchy.descendants();
  const root = d3
    .tree<GraphNode>()
    .nodeSize([VERTICAL_NODE_GAP, 1])
    .separation((a, b) => {
      // d3 passes the pair in either order.
      const [upper, lower] =
        breadthFirst.indexOf(a) < breadthFirst.indexOf(b) ? [a, b] : [b, a];
      const gap = reach(upper).bottom - reach(lower).top + LABEL_CLEARANCE_PX;
      const cousinRow = a.parent === b.parent ? 0 : 1;
      return cousinRow + Math.max(1, gap / VERTICAL_NODE_GAP);
    })(hierarchy);
  const verticalOffset = NODE_TOP - (d3.min(root.descendants(), (point) => point.x) ?? 0);
  return {
    root,
    at: (point) => ({ x: columns[point.depth] ?? 0, y: point.x + verticalOffset }),
  };
}

function placeLabels(
  layout: Layout,
  labels: ReadonlyMap<TreeNode, MeasuredLabel>,
  firstPass: ReadonlyMap<TreeNode, Placement> | null,
): PlacedLabels {
  const { root, at } = layout;
  const points = root.descendants();
  const grid = new OccupancyGrid(GRID_CELL_PX);
  const linkRadius = LINK_STROKE_PX / 2 + GRID_PADDING_PX;
  const incoming = (point: PointNode): Point[] =>
    point.parent ? sampleLink(at(point.parent), at(point), GRID_CELL_PX) : [];
  points.forEach((point, owner) => {
    grid.paintDisc(at(point), HOVER_RADIUS_PX + GRID_PADDING_PX, owner);
    grid.paintPolyline(incoming(point), linkRadius, owner);
  });

  const placements = new Map<TreeNode, Placement>();
  const rectsOf = (point: PointNode, label: MeasuredLabel, placement: Placement): Rect[] =>
    labelBlock(placement, label).rects.map((rect) => shifted(rect, at(point)));
  // Labels carry no padding of their own: rows already keep
  // LABEL_CLEARANCE_PX between label blocks, and padding plus a cell of
  // slack would reject a layout that keeps exactly that gap.
  const commit = (point: PointNode, owner: number, label: MeasuredLabel, placement: Placement) => {
    placements.set(point, placement);
    for (const rect of rectsOf(point, label, placement)) {
      grid.paintRect(rect, 0, owner);
    }
  };
  const hanging: Array<{ point: PointNode; owner: number; label: MeasuredLabel }> = [];
  points.forEach((point, owner) => {
    const label = labels.get(point);
    if (label && point.children) {
      hanging.push({ point, owner, label });
    } else if (label) {
      commit(point, owner, label, RIGHT);
    }
  });
  hanging.sort((a, b) => a.point.depth - b.point.depth || a.point.x - b.point.x);

  let fallbacks = 0;
  for (const { point, owner, label } of hanging) {
    // The grid lets a label ignore its own circle and link, so the label is
    // held to its own link exactly instead.
    const ownLink = incoming(point);
    const clearsOwnLink = (rects: Rect[]): boolean =>
      ownLink.every((sample) => rects.every((rect) => distanceToRect(sample, rect) >= linkRadius));
    const free = HANGING_CANDIDATES.find((placement) => {
      const rects = rectsOf(point, label, placement);
      return clearsOwnLink(rects) && rects.every((rect) => grid.isFree(rect, 0, owner));
    });
    const kept = firstPass?.get(point);
    if (free) {
      commit(point, owner, label, free);
    } else if (kept) {
      // The second pass's rows were spaced for this spot.
      fallbacks += 1;
      commit(point, owner, label, kept);
    } else {
      const crowding = (placement: Placement): number => {
        const rects = rectsOf(point, label, placement);
        return clearsOwnLink(rects)
          ? rects.reduce((total, rect) => total + grid.occupiedCells(rect, 0, owner), 0)
          : Number.POSITIVE_INFINITY;
      };
      commit(
        point,
        owner,
        label,
        HANGING_CANDIDATES.reduce((best, placement) =>
          crowding(placement) < crowding(best) ? placement : best,
        ),
      );
    }
  }
  return { placements, fallbacks };
}

function restingFillClass(point: TreeNode): string {
  if (point.depth === 0) {
    return "fill-aizome";
  }
  return point.data.kind === "relation" ? "fill-moss" : "fill-washi";
}

function ariaLabel(node: GraphNode): string {
  if (!node.primaryLabel) {
    return node.kind;
  }
  return node.secondaryLabel
    ? `${node.primaryLabel} (${node.secondaryLabel})`
    : node.primaryLabel;
}

function applyEmphasis(group: NodeSelection, active: boolean): void {
  group
    .select<SVGCircleElement>("circle")
    .attr("r", active ? HOVER_RADIUS_PX : 6)
    .style("fill", active ? EMPHASIS_COLOR : "");

  group.selectAll<SVGTextElement, unknown>("text").each(function () {
    this.style.fill = active ? EMPHASIS_COLOR : "";
  });
  group
    .selectAll<SVGTextElement, unknown>("text:not(.graph-ruby)")
    .each(function () {
      this.style.fontWeight = active ? "bold" : "normal";
    });
}

// Activation returns true only when handled, so desktop keyboard behavior
// remains untouched. Event bindings do not participate in SVG layout.
export function renderGraph(
  host: HTMLElement,
  model: GraphNode,
  onActivate?: (node: GraphNode, element: SVGGElement) => boolean,
): void {
  host.replaceChildren();

  const hierarchy = d3.hierarchy(model, (node) => node.children);
  const nodes = hierarchy.descendants();
  const glossLines = new Map<GraphNode, string[]>();
  for (const point of nodes) {
    glossLines.set(point.data, wrapGloss(point.data.secondaryLabel));
  }
  const linesOf = (node: GraphNode): string[] => glossLines.get(node) ?? [];
  const compactViewport =
    host.clientWidth > 0 && host.clientWidth < MOBILE_BREAKPOINT;
  const viewWidth = compactViewport ? host.clientWidth : DESKTOP_WIDTH;
  const viewHeight =
    compactViewport && host.clientHeight > 0
      ? host.clientHeight
      : DESKTOP_HEIGHT;

  const svg = d3
    .select(host)
    .append("svg")
    .attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "tree")
    .attr("aria-label", "Grammar analysis tree")
    .attr("class", "block h-full w-full bg-washi font-sans text-[12px]");

  const viewport = svg.append("g").attr("data-layer", "viewport");
  const plot = viewport
    .append("g")
    .attr("data-layer", "plot")
    .attr("transform", "translate(200,20)");

  const link = plot
    .selectAll("path.graph-link")
    .data(hierarchy.links())
    .join("path")
    .attr("class", "graph-link fill-none stroke-mist")
    .attr("stroke-width", LINK_STROKE_PX);

  const node: NodeSelection = plot
    .selectAll<SVGGElement, TreeNode>("g.graph-node")
    .data(nodes)
    .join("g")
    .attr("class", "graph-node")
    .attr("id", (point) => `graph-node-${point.data.id}`)
    .attr("role", "treeitem")
    .attr("tabindex", 0)
    .attr("aria-label", (point) => ariaLabel(point.data));

  node
    .append("circle")
    .attr(
      "class",
      (point) =>
        `stroke-fog transition-all duration-200 ${restingFillClass(point)}`,
    )
    .attr("r", 6)
    .attr("stroke-width", 1);

  node
    .filter((point) => point.data.primaryLabel !== "")
    .append("text")
    // Rule names are matches — they read green; everything else is interface indigo.
    .attr(
      "class",
      (point) =>
        `graph-primary-label text-[12px] transition-all duration-200 ${
          point.data.kind === "relation" ? "fill-moss" : "fill-aizome"
        }`,
    )
    .attr("x", (point) => (point.children ? -10 : 10))
    .attr("text-anchor", (point) => (point.children ? "end" : "start"))
    .text((point) => point.data.primaryLabel);

  node
    .filter((point) => point.data.primaryLabel !== "" && linesOf(point.data).length > 0)
    .append("text")
    .attr(
      "class",
      "graph-secondary-label fill-fog text-[10px] italic transition-all duration-200",
    )
    .attr("x", (point) => (point.children ? -10 : 10))
    .attr("text-anchor", (point) => (point.children ? "end" : "start"))
    .each(function (point) {
      const lines = linesOf(point.data);
      lines.forEach((line, index) => {
        d3.select(this)
          .append("tspan")
          .attr("x", point.children ? -10 : 10)
          .text(`${index === 0 ? "(" : ""}${line}${index === lines.length - 1 ? ")" : ""}`);
      });
    });

  node
    .selectAll<SVGTextElement, RubyRun>("text.graph-ruby")
    .data((point) => point.data.ruby)
    .join("text")
    // A size class built from RUBY_FONT_PX is invisible to Tailwind's source
    // scan, so the size is an attribute.
    .attr("class", "graph-ruby fill-fog transition-all duration-200")
    .attr("font-size", RUBY_FONT_PX)
    .attr("text-anchor", "middle")
    .attr("aria-hidden", "true")
    .attr("data-ruby-start", (run) => run.start)
    .attr("data-ruby-length", (run) => run.length)
    .text((run) => run.reading);
  // Ruby spans count toward the measured label widths; their rows follow
  // once each label has a placement.
  node.each(function () {
    placeRuby(this);
  });

  const labels = new Map<TreeNode, MeasuredLabel>();
  node.each(function (point) {
    const label = measureLabel(this);
    if (label) {
      labels.set(point, label);
    }
  });
  const columns = placeDepthColumns(depthExtents(nodes, labels), hierarchy.height);

  // The first pass's separation runs before any node has a position. d3
  // centers a parent between its first and last children, so a first or only
  // child's parent is below or level and a last child's is above. A middle
  // child's side depends on the layout that this reach feeds, so it reserves
  // both sides.
  const reserved = (point: TreeNode): Reach => {
    const label = labels.get(point);
    if (!label) {
      return HOVER_REACH;
    }
    if (!point.children) {
      return labelBlock(RIGHT, label);
    }
    const siblings = point.parent?.children ?? [point];
    const above = labelBlock({ side: "above", nudges: 0 }, label);
    const below = labelBlock({ side: "below", nudges: 0 }, label);
    if (point === siblings[0]) {
      return above;
    }
    if (point === siblings.at(-1)) {
      return below;
    }
    return { top: above.top, bottom: below.bottom };
  };
  const first = placeLabels(layOut(hierarchy, columns, reserved), labels, null);
  const layout = layOut(hierarchy, columns, (point) => {
    const label = labels.get(point);
    const placement = first.placements.get(point);
    return label && placement ? labelBlock(placement, label) : HOVER_REACH;
  });
  const { placements, fallbacks } = placeLabels(layout, labels, first.placements);
  const { root, at } = layout;
  svg.attr("data-label-fallbacks", fallbacks);

  link
    .data(root.links())
    .attr(
      "d",
      d3
        .linkHorizontal<d3.HierarchyPointLink<GraphNode>, PointNode>()
        .x((point) => at(point).x)
        .y((point) => at(point).y),
    );
  node
    .data(root.descendants())
    .attr("transform", (point) => `translate(${at(point).x},${at(point).y})`)
    .each(function (point) {
      const label = labels.get(point);
      const placement = placements.get(point);
      if (!label || !placement) {
        return;
      }
      const { primaryY, firstGlossY } = labelBlock(placement, label);
      const group = d3.select(this);
      if (placement.side !== "right") {
        group.attr("data-label-side", placement.side).attr("data-label-nudges", placement.nudges);
      }
      group.select(".graph-primary-label").attr("dy", primaryY);
      group
        .selectAll(".graph-secondary-label tspan")
        .attr("y", (_, index) => firstGlossY + GLOSS_LINE_PX * index);
      placeRuby(this);
    });

  const emphasisState = new WeakMap<
    SVGGElement,
    { hovered: boolean; focused: boolean }
  >();
  const updateEmphasis = (
    element: SVGGElement,
    kind: "hovered" | "focused",
    active: boolean,
  ): void => {
    const state = emphasisState.get(element) ?? {
      hovered: false,
      focused: false,
    };
    state[kind] = active;
    emphasisState.set(element, state);
    applyEmphasis(
      d3.select<SVGGElement, TreeNode>(element),
      state.hovered || state.focused,
    );
  };

  node
    .on("mouseenter", function () {
      updateEmphasis(this, "hovered", true);
    })
    .on("mouseleave", function () {
      updateEmphasis(this, "hovered", false);
    })
    .on("focus", function () {
      updateEmphasis(this, "focused", true);
    })
    .on("blur", function () {
      updateEmphasis(this, "focused", false);
    });

  if (onActivate) {
    node
      .on("click.dictionary", function (event: MouseEvent, point) {
        if (!event.defaultPrevented) {
          onActivate(point.data, this);
        }
      })
      .on("keydown.dictionary", function (event: KeyboardEvent, point) {
        if (
          !event.repeat &&
          (event.key === "Enter" || event.key === " ") &&
          onActivate(point.data, this)
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
  }

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 2])
    .on("zoom", (event) => {
      viewport.attr("transform", event.transform.toString());
    });

  svg.call(zoom);

  const rootX = MARGIN.left + at(root).x;
  const rootY = MARGIN.top + at(root).y;
  const initialTransform = d3.zoomIdentity.translate(
    (compactViewport ? MOBILE_ROOT_X : MARGIN.left) - rootX,
    viewHeight / 2 - rootY,
  );
  svg.call(zoom.transform, initialTransform);
}
