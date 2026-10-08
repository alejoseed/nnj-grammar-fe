import * as d3 from "d3";
import { wrapGloss } from "./gloss-lines";
import type { GraphNode, RubyRun } from "./graph-model";
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
// How far the ruby baseline sits above the label baseline. It is the label's
// ascent plus the ruby's descent, so the ruby's font box rests on the label's.
// Chromium's default CJK fallback measures 12.2px and 3.1px at 12px and 7px.
const RUBY_RISE_PX = 15;
const LABEL_CLEARANCE_PX = 2;
const LEVEL_TOLERANCE_PX = 0.5;

const EMPHASIS_COLOR = "var(--color-shu)";

type PointNode = d3.HierarchyPointNode<GraphNode>;
type NodeSelection = d3.Selection<SVGGElement, PointNode, d3.BaseType, unknown>;
type HorizontalExtent = { left: number; right: number };
type LabelSide = "above" | "below" | "right";

interface LabelBlock {
  primaryY: number;
  firstGlossY: number;
  top: number;
  bottom: number;
}

type Reach = Pick<LabelBlock, "top" | "bottom">;

function primaryBaseline(side: LabelSide, glossLift: number): number {
  switch (side) {
    case "above":
      return -1.5 * PRIMARY_FONT_PX - glossLift;
    case "below":
      return HOVER_RADIUS_PX + RUBY_FONT_PX + RUBY_RISE_PX;
    case "right":
      // 35 / 100 rather than 0.35 keeps the attribute "4.2", not 4.199999999999999.
      return (35 * PRIMARY_FONT_PX) / 100;
  }
}

function labelBlock(side: LabelSide, glossLines: number): LabelBlock {
  const glossLift = GLOSS_LINE_PX * Math.max(0, glossLines - 1);
  const primaryY = primaryBaseline(side, glossLift);
  const firstGlossY = side === "right" ? 1.5 * GLOSS_FONT_PX : primaryY + GLOSS_UNDER_LABEL_PX;
  const descent = (fontPx: number): number => fontPx / 4;
  const rubyTop = primaryY - RUBY_RISE_PX - RUBY_FONT_PX;
  const textBottom =
    glossLines > 0
      ? firstGlossY + glossLift + descent(GLOSS_FONT_PX)
      : primaryY + descent(PRIMARY_FONT_PX);
  return {
    primaryY,
    firstGlossY,
    top: Math.min(-HOVER_RADIUS_PX, rubyTop),
    bottom: Math.max(HOVER_RADIUS_PX, textBottom),
  };
}

function labelSide(point: PointNode): LabelSide {
  if (!point.children) {
    return "right";
  }
  return point.parent && point.parent.x < point.x - LEVEL_TOLERANCE_PX
    ? "below"
    : "above";
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

function widestLineWidth(text: SVGTextElement): number {
  const lines = text.querySelectorAll<SVGTSpanElement>("tspan");
  if (lines.length === 0) {
    return measuredTextWidth(text);
  }
  const fontPx = textFontPx(text);
  return Math.max(...Array.from(lines, (line) => measuredTextWidth(line, fontPx)));
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

function measureDepthExtents(nodes: NodeSelection): Map<number, HorizontalExtent> {
  const extents = new Map<number, HorizontalExtent>();

  nodes.each(function (point) {
    let left = -10;
    let right = 10;

    for (const text of this.querySelectorAll<SVGTextElement>("text")) {
      const width = widestLineWidth(text);
      const leftEdge = textLeft(text, width);
      left = Math.min(left, leftEdge);
      right = Math.max(right, leftEdge + width);
    }

    const extent = extents.get(point.depth);
    if (extent) {
      extent.left = Math.min(extent.left, left);
      extent.right = Math.max(extent.right, right);
    } else {
      extents.set(point.depth, { left, right });
    }
  });

  return extents;
}

function placeDepthColumns(
  extents: Map<number, HorizontalExtent>,
  maximumDepth: number,
): number[] {
  const columns = [0];
  let furthestRight = extents.get(0)?.right ?? 10;

  for (let depth = 1; depth <= maximumDepth; depth += 1) {
    const extent = extents.get(depth) ?? { left: -10, right: 10 };
    const position = furthestRight + HORIZONTAL_LABEL_GAP - extent.left;
    columns.push(position);
    furthestRight = Math.max(furthestRight, position + extent.right);
  }

  return columns;
}

function restingFillClass(point: PointNode): string {
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
  const glossLines = new Map<GraphNode, string[]>();
  hierarchy.each((point) => {
    glossLines.set(point.data, wrapGloss(point.data.secondaryLabel));
  });
  const linesOf = (node: GraphNode): string[] => glossLines.get(node) ?? [];
  // Separation runs before any node has a position. d3 centers a parent
  // between its first and last children, so a first or only child's parent
  // is below or level and a last child's is above. A middle child's side
  // depends on the layout that this reach feeds, so it reserves both sides.
  const layoutReach = (node: d3.HierarchyNode<GraphNode>): Reach => {
    const lines = linesOf(node.data).length;
    if (!node.children) {
      return labelBlock("right", lines);
    }
    const siblings = node.parent?.children ?? [node];
    if (node === siblings[0]) {
      return labelBlock("above", lines);
    }
    if (node === siblings.at(-1)) {
      return labelBlock("below", lines);
    }
    return { top: labelBlock("above", lines).top, bottom: labelBlock("below", lines).bottom };
  };
  const breadthFirst = hierarchy.descendants();
  const layout = d3
    .tree<GraphNode>()
    .nodeSize([VERTICAL_NODE_GAP, 1])
    .separation((a, b) => {
      // d3 passes the pair in either order.
      const [upper, lower] =
        breadthFirst.indexOf(a) < breadthFirst.indexOf(b) ? [a, b] : [b, a];
      const gap =
        layoutReach(upper).bottom - layoutReach(lower).top + LABEL_CLEARANCE_PX;
      const cousinRow = a.parent === b.parent ? 0 : 1;
      return cousinRow + Math.max(1, gap / VERTICAL_NODE_GAP);
    });
  const root = layout(hierarchy);
  const blockOf = (point: PointNode): LabelBlock =>
    labelBlock(labelSide(point), linesOf(point.data).length);
  const points = root.descendants();
  const minimumVerticalPosition = d3.min(points, (point) => point.x) ?? 0;
  const verticalOffset = NODE_TOP - minimumVerticalPosition;
  let depthColumns = Array.from(
    { length: root.height + 1 },
    (_, depth) => depth * 240,
  );
  const nodeX = (point: PointNode) => depthColumns[point.depth] ?? 0;
  const nodeY = (point: PointNode) => point.x + verticalOffset;
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

  const linkPath = d3
    .linkHorizontal<d3.HierarchyPointLink<GraphNode>, PointNode>()
    .x((point) => nodeX(point))
    .y((point) => nodeY(point));

  plot
    .selectAll("path.graph-link")
    .data(root.links())
    .join("path")
    .attr("class", "graph-link fill-none stroke-mist")
    .attr("stroke-width", 1.5)
    .attr("d", linkPath);

  const node: NodeSelection = plot
    .selectAll<SVGGElement, PointNode>("g.graph-node")
    .data(root.descendants())
    .join("g")
    .attr("class", "graph-node")
    .attr("id", (point) => `graph-node-${point.data.id}`)
    .attr("transform", (point) => `translate(${nodeX(point)},${nodeY(point)})`)
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
    .attr("dy", (point) => blockOf(point).primaryY)
    .attr("text-anchor", (point) => (point.children ? "end" : "start"))
    .text((point) => point.data.primaryLabel);

  node
    .filter((point) => linesOf(point.data).length > 0)
    .append("text")
    .attr(
      "class",
      "graph-secondary-label fill-fog text-[10px] italic transition-all duration-200",
    )
    .attr("x", (point) => (point.children ? -10 : 10))
    .attr("text-anchor", (point) => (point.children ? "end" : "start"))
    .each(function (point) {
      const { firstGlossY } = blockOf(point);
      const lines = linesOf(point.data);
      lines.forEach((line, index) => {
        d3.select(this)
          .append("tspan")
          .attr("x", point.children ? -10 : 10)
          .attr("y", firstGlossY + GLOSS_LINE_PX * index)
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
  node.each(function () {
    placeRuby(this);
  });

  depthColumns = placeDepthColumns(measureDepthExtents(node), root.height);
  node.attr(
    "transform",
    (point) => `translate(${nodeX(point)},${nodeY(point)})`,
  );
  plot.selectAll<SVGPathElement, d3.HierarchyPointLink<GraphNode>>(
    "path.graph-link",
  ).attr("d", linkPath);

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
      d3.select<SVGGElement, PointNode>(element),
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

  const rootX = MARGIN.left + nodeX(root);
  const rootY = MARGIN.top + nodeY(root);
  const initialTransform = d3.zoomIdentity.translate(
    (compactViewport ? MOBILE_ROOT_X : MARGIN.left) - rootX,
    viewHeight / 2 - rootY,
  );
  svg.call(zoom.transform, initialTransform);
}
