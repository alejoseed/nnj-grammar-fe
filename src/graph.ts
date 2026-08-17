import * as d3 from "d3";
import type { GraphNode } from "./graph-model";

const DESKTOP_WIDTH = 1200;
const DESKTOP_HEIGHT = 800;
const MOBILE_BREAKPOINT = 640;
const MOBILE_ROOT_X = 48;
const VERTICAL_NODE_GAP = 52;
const HORIZONTAL_LABEL_GAP = 32;
const NODE_TOP = 40;
const MARGIN = { top: 20, left: 200 };

// Palette tokens live in styles.css (@theme). Resting colors are Tailwind
// classes; emphasis is an inline style so it wins over them while active.
const EMPHASIS_COLOR = "var(--color-shu)";

type PointNode = d3.HierarchyPointNode<GraphNode>;
type NodeSelection = d3.Selection<SVGGElement, PointNode, d3.BaseType, unknown>;
type HorizontalExtent = { left: number; right: number };


function measuredTextWidth(text: SVGTextElement): number {
  if (typeof text.getComputedTextLength === "function") {
    try {
      const width = text.getComputedTextLength();
      if (Number.isFinite(width) && width > 0) {
        return width;
      }
    } catch {
      // jsdom does not implement SVG text measurement.
    }
  }

  const fontSize = text.classList.contains("graph-secondary-label") ? 10 : 12;
  return (text.textContent?.length ?? 0) * fontSize * 0.6;
}

function measureDepthExtents(nodes: NodeSelection): Map<number, HorizontalExtent> {
  const extents = new Map<number, HorizontalExtent>();

  nodes.each(function (point) {
    let left = -10;
    let right = 10;

    for (const text of this.querySelectorAll<SVGTextElement>("text")) {
      const x = Number(text.getAttribute("x") ?? 0);
      const width = measuredTextWidth(text);
      if (text.getAttribute("text-anchor") === "end") {
        left = Math.min(left, x - width);
        right = Math.max(right, x);
      } else {
        left = Math.min(left, x);
        right = Math.max(right, x + width);
      }
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
    .attr("r", active ? 10 : 6)
    .style("fill", active ? EMPHASIS_COLOR : "");

  group.selectAll<SVGTextElement, unknown>("text").each(function () {
    this.style.fill = active ? EMPHASIS_COLOR : "";
    this.style.fontWeight = active ? "bold" : "normal";
  });
}

export function renderGraph(host: HTMLElement, model: GraphNode): void {
  host.replaceChildren();

  const layout = d3
    .tree<GraphNode>()
    .nodeSize([VERTICAL_NODE_GAP, 1]);
  const root = layout(d3.hierarchy(model, (node) => node.children));
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
    .attr("dy", (point) => (point.children ? "-1.5em" : ".35em"))
    .attr("text-anchor", (point) => (point.children ? "end" : "start"))
    .text((point) => point.data.primaryLabel);

  node
    .filter((point) => point.data.secondaryLabel !== "")
    .append("text")
    .attr(
      "class",
      "graph-secondary-label fill-fog text-[10px] italic transition-all duration-200",
    )
    .attr("x", (point) => (point.children ? -10 : 10))
    .attr("dy", (point) => (point.children ? "-.5em" : "1.5em"))
    .attr("text-anchor", (point) => (point.children ? "end" : "start"))
    .text((point) => `(${point.data.secondaryLabel})`);

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
