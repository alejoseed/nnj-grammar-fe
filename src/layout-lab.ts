import * as d3 from "d3";
import { linkPath, type Bend } from "./graph";
import type { Point } from "./occupancy";
import {
  clampBend,
  LabelSide,
  sameBend,
  type LayoutFeedback,
  type LinkFeedback,
  type NodeFeedback,
} from "./layout-lab-model";

const MOBILE_BREAKPOINT = 640;
const HANDLE_RADIUS_PX = 5;
const HANDLE_REST_PX = 14;
const HANDLE_FILL = "var(--color-kohaku)";
const MOVED_STROKE = "var(--color-kohaku)";

interface NodeState {
  element: SVGGElement;
  texts: SVGTextElement[];
  feedback: NodeFeedback;
}

interface LinkState {
  element: SVGPathElement;
  source: NodeState;
  target: NodeState;
  feedback: LinkFeedback;
  startHandle: SVGCircleElement;
  endHandle: SVGCircleElement;
}

export type RestoreMode = "absolute" | "relative";

export interface LayoutLab {
  snapshot: () => LayoutFeedback;
  restore: (saved: LayoutFeedback, mode?: RestoreMode) => void;
  reset: () => void;
  showHandles: (visible: boolean) => void;
  detach: () => void;
}

function translation(element: Element): Point {
  const match = /translate\(\s*([-\d.e]+)\s*[, ]\s*([-\d.e]+)\s*\)/.exec(
    element.getAttribute("transform") ?? "",
  );
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

function numberAttribute(element: Element, name: string): number | null {
  const value = element.getAttribute(name);
  return value === null || value === "" ? null : Number(value);
}

function bendAttribute(element: Element): Bend | null {
  const start = numberAttribute(element, "data-bend-start");
  const end = numberAttribute(element, "data-bend-end");
  return start === null || end === null ? null : { start, end };
}

function readNode(element: SVGGElement, depth: number, hasChildren: boolean): NodeState {
  const at = translation(element);
  const texts = Array.from(element.querySelectorAll<SVGTextElement>("text"));
  const primary = element.querySelector<SVGTextElement>("text.graph-primary-label");
  const side = LabelSide.catch("right").parse(element.getAttribute("data-label-side"));
  return {
    element,
    texts,
    feedback: {
      id: element.id.replace(/^graph-node-/, ""),
      label: primary?.textContent ?? "",
      depth,
      hasChildren,
      auto: at,
      final: at,
      labelPlacement: {
        side,
        nudges: numberAttribute(element, "data-label-nudges") ?? 0,
        anchor: {
          x: primary ? (numberAttribute(primary, "x") ?? 0) : 0,
          y: primary ? (numberAttribute(primary, "dy") ?? 0) : 0,
        },
        offset: { x: 0, y: 0 },
      },
    },
  };
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function attachLayoutLab(
  host: HTMLElement,
  sentence: string,
  onChange: (feedback: LayoutFeedback) => void,
): LayoutLab {
  const svg = host.querySelector<SVGSVGElement>("svg");
  const plot = host.querySelector<SVGGElement>("g[data-layer=plot]");
  if (!svg || !plot) {
    throw new Error("layout lab needs a rendered graph");
  }
  const compact = host.clientWidth > 0 && host.clientWidth < MOBILE_BREAKPOINT;
  const [, , viewWidth = 0, viewHeight = 0] = (svg.getAttribute("viewBox") ?? "")
    .split(/\s+/)
    .map(Number);

  const linkElements = Array.from(plot.querySelectorAll<SVGPathElement>("path.graph-link"));
  const parentOf = new Map<string, string>();
  for (const element of linkElements) {
    parentOf.set(
      element.getAttribute("data-link-target") ?? "",
      element.getAttribute("data-link-source") ?? "",
    );
  }
  const depthOf = (id: string): number => {
    let depth = 0;
    for (let parent = parentOf.get(id); parent !== undefined; parent = parentOf.get(parent)) {
      depth += 1;
    }
    return depth;
  };
  const parents = new Set(parentOf.values());

  const nodes = new Map<string, NodeState>();
  for (const element of plot.querySelectorAll<SVGGElement>("g.graph-node")) {
    const id = element.id.replace(/^graph-node-/, "");
    nodes.set(id, readNode(element, depthOf(id), parents.has(id)));
  }

  const handles = d3.select(plot).append("g").attr("class", "lab-handles").attr("display", "none");
  const handle = (target: string, end: "start" | "end"): SVGCircleElement => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    d3.select(circle)
      .attr("class", "lab-handle")
      .attr("data-link-target", target)
      .attr("data-handle", end)
      .attr("r", HANDLE_RADIUS_PX)
      .attr("fill", HANDLE_FILL)
      .attr("stroke", "white")
      .attr("stroke-width", 1.5)
      .style("cursor", "ew-resize");
    handles.node()?.append(circle);
    return circle;
  };

  const links: LinkState[] = [];
  for (const element of linkElements) {
    const source = nodes.get(element.getAttribute("data-link-source") ?? "");
    const target = nodes.get(element.getAttribute("data-link-target") ?? "");
    if (!source || !target) {
      continue;
    }
    const auto = bendAttribute(element);
    links.push({
      element,
      source,
      target,
      feedback: { source: source.feedback.id, target: target.feedback.id, auto, final: auto },
      startHandle: handle(target.feedback.id, "start"),
      endHandle: handle(target.feedback.id, "end"),
    });
  }

  const drawNode = (node: NodeState): void => {
    const { final, auto, labelPlacement } = node.feedback;
    node.element.setAttribute("transform", `translate(${final.x},${final.y})`);
    const offset = labelPlacement.offset;
    for (const text of node.texts) {
      if (offset.x === 0 && offset.y === 0) {
        text.removeAttribute("transform");
      } else {
        text.setAttribute("transform", `translate(${offset.x},${offset.y})`);
      }
    }
    const moved = !samePoint(final, auto) || offset.x !== 0 || offset.y !== 0;
    node.element.setAttribute("data-lab-moved", String(moved));
    const circle = node.element.querySelector("circle");
    circle?.style.setProperty("stroke", moved ? MOVED_STROKE : "");
    circle?.style.setProperty("stroke-width", moved ? "2" : "");
  };

  const drawLink = (link: LinkState): void => {
    const source = link.source.feedback.final;
    const target = link.target.feedback.final;
    const bend = link.feedback.final
      ? clampBend(link.feedback.final, source, target)
      : null;
    link.feedback.final = bend;
    link.element.setAttribute("d", linkPath(source, target, bend ?? undefined));
    link.element.style.stroke = sameBend(bend, link.feedback.auto) ? "" : MOVED_STROKE;
    const startX = bend ? bend.start : Math.min(source.x + HANDLE_REST_PX, target.x);
    const endX = bend ? bend.end : Math.max(target.x - HANDLE_REST_PX, source.x);
    link.startHandle.setAttribute("cx", String(startX));
    link.startHandle.setAttribute("cy", String(source.y));
    link.endHandle.setAttribute("cx", String(endX));
    link.endHandle.setAttribute("cy", String(target.y));
  };

  const snapshot = (): LayoutFeedback => ({
    version: 1,
    sentence,
    savedAt: new Date().toISOString(),
    viewport: { width: viewWidth, height: viewHeight, compact },
    notes: "",
    nodes: Array.from(nodes.values(), (node) => structuredClone(node.feedback)),
    links: links.map((link) => structuredClone(link.feedback)),
  });

  const drawAll = (): void => {
    for (const node of nodes.values()) {
      drawNode(node);
    }
    for (const link of links) {
      drawLink(link);
    }
    onChange(snapshot());
  };

  const linksTouching = (node: NodeState): LinkState[] =>
    links.filter((link) => link.source === node || link.target === node);

  const nodeDrag = d3
    .drag<SVGGElement, unknown>()
    .container(plot)
    .subject(function () {
      const node = nodes.get(this.id.replace(/^graph-node-/, ""));
      return node ? { ...node.feedback.final } : { x: 0, y: 0 };
    })
    .on("drag", function (event: d3.D3DragEvent<SVGGElement, unknown, Point>) {
      const node = nodes.get(this.id.replace(/^graph-node-/, ""));
      if (!node) {
        return;
      }
      const { auto } = node.feedback;
      node.feedback.final = {
        x: auto.x + Math.round(event.x - auto.x),
        y: auto.y + Math.round(event.y - auto.y),
      };
      drawNode(node);
      for (const link of linksTouching(node)) {
        drawLink(link);
      }
    })
    .on("end", () => onChange(snapshot()));

  const labelDrag = d3
    .drag<SVGTextElement, unknown>()
    .container(plot)
    .subject(function () {
      const node = nodes.get(this.closest("g.graph-node")?.id.replace(/^graph-node-/, "") ?? "");
      return node ? { ...node.feedback.labelPlacement.offset } : { x: 0, y: 0 };
    })
    .on("drag", function (event: d3.D3DragEvent<SVGTextElement, unknown, Point>) {
      const node = nodes.get(this.closest("g.graph-node")?.id.replace(/^graph-node-/, "") ?? "");
      if (!node) {
        return;
      }
      node.feedback.labelPlacement.offset = { x: Math.round(event.x), y: Math.round(event.y) };
      drawNode(node);
    })
    .on("end", () => onChange(snapshot()));

  const handleDrag = (link: LinkState, end: "start" | "end") =>
    d3
      .drag<SVGCircleElement, unknown>()
      .container(plot)
      .on("drag", (event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>) => {
        const source = link.source.feedback.final;
        const target = link.target.feedback.final;
        const current = link.feedback.final ?? { start: source.x, end: target.x };
        link.feedback.final = clampBend(
          { ...current, [end]: Math.round(event.x) },
          source,
          target,
        );
        drawLink(link);
      })
      .on("end", () => onChange(snapshot()));

  for (const node of nodes.values()) {
    d3.select(node.element).style("cursor", "grab").call(nodeDrag);
    d3.selectAll(node.texts).style("cursor", "move").call(labelDrag);
  }
  for (const link of links) {
    d3.select(link.startHandle).call(handleDrag(link, "start"));
    d3.select(link.endHandle).call(handleDrag(link, "end"));
  }
  svg.setAttribute("data-layout-lab", "true");
  drawAll();

  return {
    snapshot,
    restore(saved, mode = "absolute") {
      for (const savedNode of saved.nodes) {
        const node = nodes.get(savedNode.id);
        if (!node) {
          continue;
        }
        node.feedback.final =
          mode === "absolute"
            ? { ...savedNode.final }
            : {
                x: node.feedback.auto.x + savedNode.final.x - savedNode.auto.x,
                y: node.feedback.auto.y + savedNode.final.y - savedNode.auto.y,
              };
        node.feedback.labelPlacement.offset = { ...savedNode.labelPlacement.offset };
      }
      for (const savedLink of saved.links) {
        const link = links.find((candidate) => candidate.feedback.target === savedLink.target);
        if (link) {
          link.feedback.final = savedLink.final ? { ...savedLink.final } : null;
        }
      }
      drawAll();
    },
    showHandles(visible) {
      handles.attr("display", visible ? null : "none");
    },
    reset() {
      for (const node of nodes.values()) {
        node.feedback.final = { ...node.feedback.auto };
        node.feedback.labelPlacement.offset = { x: 0, y: 0 };
      }
      for (const link of links) {
        link.feedback.final = link.feedback.auto ? { ...link.feedback.auto } : null;
      }
      drawAll();
    },
    detach() {
      for (const node of nodes.values()) {
        d3.select(node.element).on(".drag", null).style("cursor", null);
        d3.selectAll(node.texts).on(".drag", null).style("cursor", null);
      }
      handles.remove();
      svg.removeAttribute("data-layout-lab");
    },
  };
}
