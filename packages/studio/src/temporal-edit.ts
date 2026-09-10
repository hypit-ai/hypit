import type { StudioEditHandle, StudioSemanticAnchor, StudioTemporalInstantProjection } from "@hypit/studio-adapter";

export type SemanticTarget =
  | { readonly kind: "selection"; readonly startAnchorId: string; readonly endAnchorId: string }
  | { readonly kind: "moment"; readonly anchorId: string };

type Span = { readonly startFrame: number; readonly endFrameExclusive: number };

/** Project only the semantic write exposed by the handle. This does not invert expressions. */
export function semanticGestureSpan(
  anchors: readonly StudioSemanticAnchor[], handle: StudioEditHandle, target: SemanticTarget,
): Span | undefined {
  const semantic = handle.semantic;
  const temporal = handle.temporal;
  if (!semantic || !temporal || target.kind !== semantic.kind) return undefined;
  const byId = new Map(anchors.map((anchor, order) => [anchor.id, { ...anchor, order }]));
  let span: Span;
  if (semantic.kind === "moment" && target.kind === "moment") {
    const previous = byId.get(semantic.anchorId);
    const next = byId.get(target.anchorId);
    if (!previous || !next) return undefined;
    const delta = next.frame - previous.frame;
    span = temporal.kind === "instant"
      ? { startFrame: temporal.frame + delta, endFrameExclusive: temporal.frame + delta + 1 }
      : { startFrame: temporal.startFrame + delta, endFrameExclusive: temporal.endFrameExclusive + delta };
  } else if (semantic.kind === "selection" && target.kind === "selection") {
    const start = byId.get(target.startAnchorId);
    const end = byId.get(target.endAnchorId);
    if (!start || !end || start.order > end.order) return undefined;
    if (temporal.kind === "instant") {
      if (temporal.authority.kind !== "semantic") return undefined;
      if (temporal.authority.boundary === "start" && target.endAnchorId !== semantic.endAnchorId
        || temporal.authority.boundary === "end" && target.startAnchorId !== semantic.startAnchorId) return undefined;
      const frame = temporal.authority.boundary === "start" ? start.frame : end.frame;
      span = { startFrame: frame, endFrameExclusive: frame + 1 };
    } else {
      if (handle.gesture === "trim-start" && target.endAnchorId !== semantic.endAnchorId
        || handle.gesture === "trim-end" && target.startAnchorId !== semantic.startAnchorId) return undefined;
      if (handle.gesture === "move") {
        const stops = [...new Set(anchors.map((anchor) => anchor.frame))].sort((a, b) => a - b);
        const previousStart = byId.get(semantic.startAnchorId);
        const previousEnd = byId.get(semantic.endAnchorId);
        if (!previousStart || !previousEnd
          || stops.indexOf(start.frame) - stops.indexOf(previousStart.frame)
            !== stops.indexOf(end.frame) - stops.indexOf(previousEnd.frame)) return undefined;
      }
      span = { startFrame: start.frame, endFrameExclusive: end.frame };
    }
  } else return undefined;
  if (!Number.isSafeInteger(span.startFrame) || span.startFrame < 0
    || !Number.isSafeInteger(span.endFrameExclusive) || span.endFrameExclusive <= span.startFrame) return undefined;
  if (temporal.kind === "window"
    && ((handle.gesture === "trim-start" && span.endFrameExclusive !== temporal.endFrameExclusive)
      || (handle.gesture === "trim-end" && span.startFrame !== temporal.startFrame))) return undefined;
  return span;
}

/** A stop is a frame position; coincident anchors remain distinct choices at that stop. */
export function chooseSemanticGesture(input: {
  readonly anchors: readonly StudioSemanticAnchor[];
  readonly handle: StudioEditHandle;
  readonly pointerStart: number;
  readonly pointerNow: number;
  readonly frameCount: number;
}): SemanticTarget | undefined {
  const { anchors, handle } = input;
  const semantic = handle.semantic;
  const temporal = handle.temporal;
  if (!semantic || !temporal) return undefined;
  const order = new Map(anchors.map((anchor, index) => [anchor.id, index]));
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const at = new Map<number, StudioSemanticAnchor[]>();
  for (const anchor of anchors) at.set(anchor.frame, [...at.get(anchor.frame) ?? [], anchor]);
  const stops = [...at.keys()].sort((a, b) => a - b);
  const ranked = (choices: readonly StudioSemanticAnchor[], preferred: StudioSemanticAnchor) => [...choices].sort((a, b) =>
    Number(a.id !== preferred.id) - Number(b.id !== preferred.id)
    || Number(a.kind !== preferred.kind) - Number(b.kind !== preferred.kind)
    || order.get(a.id)! - order.get(b.id)!);
  const valid = (target: SemanticTarget) => {
    const span = semanticGestureSpan(anchors, handle, target);
    return span !== undefined && (temporal.kind === "instant" ? span.startFrame : span.endFrameExclusive) <= input.frameCount;
  };
  const delta = input.pointerNow - input.pointerStart;
  if (semantic.kind === "moment") {
    const current = byId.get(semantic.anchorId);
    if (!current) return undefined;
    const candidates = ranked(anchors, current).sort((a, b) =>
      Math.abs(a.frame - current.frame - delta) - Math.abs(b.frame - current.frame - delta));
    return candidates.map((anchor): SemanticTarget => ({ kind: "moment", anchorId: anchor.id })).find(valid);
  }
  const start = byId.get(semantic.startAnchorId);
  const end = byId.get(semantic.endAnchorId);
  if (!start || !end) return undefined;
  const target = (a: StudioSemanticAnchor, b: StudioSemanticAnchor): SemanticTarget => ({
    kind: "selection", startAnchorId: a.id, endAnchorId: b.id,
  });
  if (handle.gesture === "move" && temporal.kind === "window") {
    const first = stops.indexOf(start.frame);
    const last = stops.indexOf(end.frame);
    const shifts = stops.map((_, index) => index - first)
      .filter((shift) => last + shift >= 0 && last + shift < stops.length)
      .sort((a, b) => Math.abs(stops[first + a]! - start.frame - delta)
        - Math.abs(stops[first + b]! - start.frame - delta) || Math.abs(a) - Math.abs(b));
    for (const shift of shifts) {
      for (const a of ranked(at.get(stops[first + shift]!)!, start)) {
        for (const b of ranked(at.get(stops[last + shift]!)!, end)) {
          const candidate = target(a, b);
          if (valid(candidate)) return candidate;
        }
      }
    }
    return undefined;
  }
  const boundary = temporal.kind === "instant" && temporal.authority.kind === "semantic"
    ? temporal.authority.boundary : handle.gesture === "trim-start" ? "start" : "end";
  const current = boundary === "start" ? start : end;
  const candidates = ranked(anchors, current).sort((a, b) =>
    Math.abs(a.frame - current.frame - delta) - Math.abs(b.frame - current.frame - delta));
  return candidates.map((anchor) => boundary === "start" ? target(anchor, end) : target(start, anchor)).find(valid);
}


/** Keep the reference and write its local frame offset; a bare reference starts at zero. */
export function formatTemporalPointEdit(
  reference: StudioTemporalInstantProjection["reference"], desired: number, base?: number,
): string {
  if (reference === "absolute") return `${desired}f`;
  if (base === undefined) throw new Error(`The ${reference} projection base is unavailable.`);
  const offset = desired - base;
  return `${reference}${offset >= 0 ? "+" : ""}${offset}f`;
}
