import { z } from "zod";
import { LayoutSettings } from "./layout-settings";

const Point = z.object({ x: z.number(), y: z.number() });

const Bend = z.object({ start: z.number(), end: z.number() });

export const LabelSide = z.enum(["above", "below", "right"]);
export type LabelSide = z.infer<typeof LabelSide>;

export const NodeFeedback = z.object({
  id: z.string(),
  label: z.string(),
  depth: z.int().nonnegative(),
  hasChildren: z.boolean(),
  auto: Point,
  final: Point,
  labelPlacement: z.object({
    side: LabelSide,
    nudges: z.int().nonnegative(),
    anchor: Point,
    offset: Point,
  }),
});
export type NodeFeedback = z.infer<typeof NodeFeedback>;

export const LinkFeedback = z.object({
  source: z.string(),
  target: z.string(),
  auto: Bend.nullable(),
  final: Bend.nullable(),
});
export type LinkFeedback = z.infer<typeof LinkFeedback>;

export const LayoutFeedback = z.object({
  version: z.literal(1),
  sentence: z.string(),
  savedAt: z.string(),
  viewport: z.object({ width: z.number(), height: z.number(), compact: z.boolean() }),
  notes: z.string(),
  settings: LayoutSettings.optional(),
  nodes: z.array(NodeFeedback),
  links: z.array(LinkFeedback),
});
export type LayoutFeedback = z.infer<typeof LayoutFeedback>;

type PointValue = z.infer<typeof Point>;
type BendValue = z.infer<typeof Bend>;

export const SNAP_PX = 8;

export function feedbackKey(sentence: string, compact: boolean): string {
  const base = sentence.trim().replace(/[\s/\\]+/g, "_").replace(/\.+/g, "_");
  return compact ? `${base}.phone` : base;
}

export function isSafeKey(key: string): boolean {
  return /^[^/\\\0]+$/.test(key) && key !== "." && key !== "..";
}

export function clampBend(bend: BendValue, source: PointValue, target: PointValue): BendValue | null {
  const start = Math.min(Math.max(bend.start, source.x), target.x);
  const end = Math.max(Math.min(bend.end, target.x), start);
  const snappedStart = start - source.x < SNAP_PX ? source.x : start;
  const snappedEnd = target.x - end < SNAP_PX ? target.x : end;
  if (snappedStart === source.x && snappedEnd === target.x) {
    return null;
  }
  return { start: snappedStart, end: Math.max(snappedEnd, snappedStart) };
}

export function sameBend(a: BendValue | null, b: BendValue | null): boolean {
  return a === null || b === null ? a === b : a.start === b.start && a.end === b.end;
}

export function movedNodes(feedback: LayoutFeedback): number {
  return feedback.nodes.filter((node) => node.auto.x !== node.final.x || node.auto.y !== node.final.y)
    .length;
}

export function movedLabels(feedback: LayoutFeedback): number {
  return feedback.nodes.filter(
    (node) => node.labelPlacement.offset.x !== 0 || node.labelPlacement.offset.y !== 0,
  ).length;
}

export function movedLinks(feedback: LayoutFeedback): number {
  return feedback.links.filter((link) => !sameBend(link.auto, link.final)).length;
}
