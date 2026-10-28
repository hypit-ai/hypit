import type {
  StudioPlacement,
  StudioTemporalConstraint,
  StudioTemporalDeclarationCompanion,
  StudioTemporalDeclarationDraft,
  StudioTemporalRelationCompanion,
  StudioTemporalInstantProjection,
  StudioTemporalRelationTrace,
  StudioTemporalRelationValue,
} from "@hypit/studio-companion";
import type { FrameSpan } from "@hypit/timeline";

import { timelineAuthorModuleRef, timelineAuthorProducers } from "./manifest.js";
import type {
  ConstructionDurationSpec,
  ConstructionExtent,
  ConstructionOffsetSpec,
  ConstructionPoint,
} from "./types.js";

function output(
  placement: StudioPlacement,
  name: string,
  id: string,
  range = placement.range,
): StudioTemporalDeclarationDraft | undefined {
  const found = placement.outputPorts.find((candidate) => candidate.name === name);
  return found === undefined ? undefined : { id, label: id, output: found.ref, range };
}

const localName = (tag: string) => tag.slice(tag.lastIndexOf(":") + 1);

export const timelineAuthorStudioTemporalDeclarations: readonly StudioTemporalDeclarationCompanion[] = [{
  id: "timeline-declarations",
  match: { module: timelineAuthorModuleRef, declaration: "timeline" },
  project({ placement }) {
    return placement.children.flatMap((child) => {
      if (child.id === undefined || localName(child.tag) !== "Instant") return [];
      const found = output(placement, `anchor-${child.id}`, child.id, child.range);
      return found === undefined ? [] : [found];
    });
  },
}, {
  id: "instant-declaration",
  match: { module: timelineAuthorModuleRef, declaration: "instant" },
  project({ placement }) {
    if (placement.id === undefined) return [];
    const found = output(placement, "instant", placement.id);
    return found === undefined ? [] : [found];
  },
}];

function value<T>(input: StudioTemporalRelationValue | undefined, label: string): T {
  if (input === undefined) throw new Error(`Timeline Author inverse requires ${label}.`);
  return input.value as T;
}

const instant = (target: StudioTemporalConstraint): Extract<StudioTemporalConstraint, { readonly kind: "instant" }> | undefined =>
  target.kind === "instant" ? target : undefined;
const extent = (target: StudioTemporalConstraint): Extract<StudioTemporalConstraint, { readonly kind: "extent" }> | undefined =>
  target.kind === "extent" ? target : undefined;
const span = (target: StudioTemporalConstraint): Extract<StudioTemporalConstraint, { readonly kind: "span" }> | undefined =>
  target.kind === "span" ? target : undefined;

function pointTrace(trace: StudioTemporalRelationTrace | undefined): StudioTemporalInstantProjection | undefined {
  return trace?.kind === "instant" ? trace : undefined;
}

function withFrame(point: StudioTemporalInstantProjection, frame: number): StudioTemporalInstantProjection {
  return { ...point, frame };
}

function parameterFromExtent(
  trace: StudioTemporalRelationTrace | undefined,
  relation: "after-start" | "before-end",
): Extract<StudioTemporalInstantProjection["authority"], { readonly kind: "parameter" }> | undefined {
  return trace?.kind === "extent" && trace.authority !== undefined
    ? { ...trace.authority, relation } : undefined;
}

/** Timeline Author owns the inverse meaning of its private construction Producers. */
export const timelineAuthorStudioTemporalRelations: readonly StudioTemporalRelationCompanion[] = [
  {
    id: "materialize-instant", match: { producer: timelineAuthorProducers.instant, output: "instant" },
    invert({ target }) {
      const desired = instant(target);
      return desired === undefined ? [] : [{ constraints: [{ input: "point", target: desired }] }];
    },
    trace({ output, trace }) {
      const held = output.value as { readonly timelineId?: unknown; readonly frame?: unknown };
      const point = pointTrace(trace("point"));
      return point === undefined || typeof held.timelineId !== "string" || !Number.isSafeInteger(held.frame)
        ? undefined : { ...point, frame: held.frame as number,
          source: { ...point.source, scope: "timeline", timelineId: held.timelineId } };
    },
  }, {
    id: "materialize-window", match: { producer: timelineAuthorProducers.window, output: "window" },
    invert({ target }) {
      const desired = span(target);
      return desired === undefined ? [] : [{ constraints: [{ input: "span", target: desired }] }];
    },
    trace({ output, trace }) {
      const held = output.value as {
        readonly start?: { readonly timelineId?: unknown };
        readonly end?: { readonly timelineId?: unknown };
        readonly span?: { readonly startFrame?: unknown; readonly endFrameExclusive?: unknown };
      };
      const source = trace("span");
      return source?.kind !== "window" || !Number.isSafeInteger(held.span?.startFrame)
        || !Number.isSafeInteger(held.span?.endFrameExclusive)
        || typeof held.start?.timelineId !== "string"
        || typeof held.end?.timelineId !== "string" ? undefined : {
          ...source,
          start: { ...withFrame(source.start, held.span!.startFrame as number),
            source: { ...source.start.source, scope: "timeline", timelineId: held.start.timelineId } },
          end: { ...withFrame(source.end, held.span!.endFrameExclusive as number),
            source: { ...source.end.source, scope: "timeline", timelineId: held.end.timelineId } },
          startFrame: held.span!.startFrame as number,
          endFrameExclusive: held.span!.endFrameExclusive as number,
        };
    },
  }, {
    id: "alias-point", match: { producer: timelineAuthorProducers.aliasPoint, output: "point" },
    invert({ target }) {
      const desired = instant(target);
      return desired === undefined ? [] : [{ constraints: [{ input: "point", target: desired }] }];
    },
    trace({ output, trace }) {
      const held = value<ConstructionPoint>(output, "Point");
      const source = pointTrace(trace("point"));
      return source === undefined ? undefined : withFrame(source, held.frame);
    },
  }, {
    id: "span-start", match: { producer: timelineAuthorProducers.spanStart, output: "point" },
    invert({ target, inputs }) {
      const desired = instant(target);
      const current = value<FrameSpan>(inputs.span, "Span");
      return desired === undefined ? [] : [{ constraints: [{ input: "span", target: {
        kind: "span", startFrame: desired.frame, endFrameExclusive: current.endFrameExclusive,
      } }] }];
    },
    trace({ trace }) {
      const held = trace("span");
      return held?.kind === "window" ? held.start : undefined;
    },
  }, {
    id: "span-end", match: { producer: timelineAuthorProducers.spanEnd, output: "point" },
    invert({ target, inputs }) {
      const desired = instant(target);
      const current = value<FrameSpan>(inputs.span, "Span");
      return desired === undefined ? [] : [{ constraints: [{ input: "span", target: {
        kind: "span", startFrame: current.startFrame, endFrameExclusive: desired.frame,
      } }] }];
    },
    trace({ trace }) {
      const held = trace("span");
      return held?.kind === "window" ? held.end : undefined;
    },
  }, {
    id: "span-between", match: { producer: timelineAuthorProducers.spanBetween, output: "span" },
    invert({ target }) {
      const desired = span(target);
      return desired === undefined ? [] : [{ constraints: [
        { input: "start", target: { kind: "instant", frame: desired.startFrame } },
        { input: "end", target: { kind: "instant", frame: desired.endFrameExclusive } },
      ] }];
    },
    trace({ output, trace }) {
      const held = value<FrameSpan>(output, "Span");
      const start = pointTrace(trace("start")); const end = pointTrace(trace("end"));
      return start === undefined || end === undefined ? undefined : {
        kind: "window", start: withFrame(start, held.startFrame), end: withFrame(end, held.endFrameExclusive),
        startFrame: held.startFrame, endFrameExclusive: held.endFrameExclusive,
      };
    },
  }, {
    id: "span-from", match: { producer: timelineAuthorProducers.span, output: "span" },
    invert({ target }) {
      const desired = span(target);
      return desired === undefined ? [] : [{ constraints: [
        { input: "start", target: { kind: "instant", frame: desired.startFrame } },
        { input: "extent", target: { kind: "extent", frameCount: desired.endFrameExclusive - desired.startFrame } },
      ] }];
    },
    trace({ output, trace }) {
      const held = value<FrameSpan>(output, "Span");
      const start = pointTrace(trace("start")); const length = trace("extent");
      if (start === undefined || length?.kind !== "extent") return undefined;
      const authority = parameterFromExtent(length, "after-start");
      const end = withFrame({ ...start, expression: `${held.endFrameExclusive}f`, reference: "absolute",
        authority: authority ?? { kind: "fixed" } }, held.endFrameExclusive);
      return { kind: "window", start: withFrame(start, held.startFrame), end,
        startFrame: held.startFrame, endFrameExclusive: held.endFrameExclusive };
    },
  }, {
    id: "span-ending", match: { producer: timelineAuthorProducers.spanEnding, output: "span" },
    invert({ target }) {
      const desired = span(target);
      return desired === undefined ? [] : [{ constraints: [
        { input: "end", target: { kind: "instant", frame: desired.endFrameExclusive } },
        { input: "extent", target: { kind: "extent", frameCount: desired.endFrameExclusive - desired.startFrame } },
      ] }];
    },
    trace({ output, trace }) {
      const held = value<FrameSpan>(output, "Span");
      const end = pointTrace(trace("end")); const length = trace("extent");
      if (end === undefined || length?.kind !== "extent") return undefined;
      const authority = parameterFromExtent(length, "before-end");
      const start = withFrame({ ...end, expression: `${held.startFrame}f`, reference: "absolute",
        authority: authority ?? { kind: "fixed" } }, held.startFrame);
      return { kind: "window", start, end: withFrame(end, held.endFrameExclusive),
        startFrame: held.startFrame, endFrameExclusive: held.endFrameExclusive };
    },
  }, {
    id: "duration", match: { producer: timelineAuthorProducers.duration, output: "extent" },
    invert({ target, inputs }) {
      const desired = extent(target);
      const spec = value<ConstructionDurationSpec>(inputs.duration, "Duration Spec");
      return desired === undefined || spec.author === undefined ? [] : [{ writes: [{
        input: "duration", binding: spec.author.binding, replacement: `${desired.frameCount}f`,
      }] }];
    },
    trace({ output, inputs }) {
      const held = value<ConstructionExtent>(output, "Extent");
      const specInput = inputs.duration;
      const spec = value<ConstructionDurationSpec>(specInput, "Duration Spec");
      return { kind: "extent", frameCount: held.frameCount,
        ...(spec.author === undefined || specInput === undefined ? {} : { authority: {
          kind: "parameter" as const, binding: spec.author.binding,
          owner: `${specInput.record}:${spec.author.binding}`, relation: "direct" as const,
        } }) };
    },
  }, {
    id: "resolved-extent", match: { producer: timelineAuthorProducers.resolvedExtent, output: "extent" },
    invert({ target, output }) {
      const desired = extent(target);
      const current = value<ConstructionExtent>(output, "Extent");
      return desired !== undefined && desired.frameCount === current.frameCount ? [{}] : [];
    },
    trace({ output }) { return { kind: "extent", frameCount: value<ConstructionExtent>(output, "Extent").frameCount }; },
  }, {
    id: "offset-point", match: { producer: timelineAuthorProducers.offset, output: "point" },
    invert({ target, inputs }) {
      const desired = instant(target);
      if (desired === undefined) return [];
      const spec = value<ConstructionOffsetSpec>(inputs.spec, "Offset Spec");
      const base = value<ConstructionPoint>(inputs.point, "base Point").frame;
      if (spec.author?.expression?.kind === "absolute") {
        return [{ writes: [{ input: "spec", binding: spec.author.binding, replacement: `${desired.frame}f` }] }];
      }
      if (spec.author?.expression?.kind === "offset") {
        const difference = desired.frame - base;
        const sign = difference < 0 ? "-" : "+";
        return [{
          constraints: [{ input: "point", target: { kind: "instant", frame: base } }],
          writes: [{ input: "spec", binding: spec.author.binding,
            replacement: `${spec.author.expression.base}${sign}${Math.abs(difference)}f` }],
        }];
      }
      const held = value<ConstructionExtent>(inputs.extent, "offset Extent").frameCount;
      return [{ constraints: [{ input: "point", target: {
        kind: "instant", frame: desired.frame - spec.direction * held,
      } }] }];
    },
    trace({ output, inputs, trace }) {
      const held = value<ConstructionPoint>(output, "Point");
      const specInput = inputs.spec;
      const spec = value<ConstructionOffsetSpec>(specInput, "Offset Spec");
      const upstream = pointTrace(trace("point"));
      if (upstream === undefined) return undefined;
      if (spec.author === undefined || specInput === undefined) return withFrame(upstream, held.frame);
      return { ...upstream, frame: held.frame,
        expression: spec.author.expression?.kind === "offset"
          ? `${spec.author.expression.base}${spec.direction < 0 ? "-" : "+"}${value<ConstructionExtent>(inputs.extent, "Extent").frameCount}f`
          : `${held.frame}f`,
        reference: "absolute",
        authority: { kind: "parameter", binding: spec.author.binding,
          owner: `${specInput.record}:${spec.author.binding}`, relation: "direct" } };
    },
  }, {
    id: "origin", match: { producer: timelineAuthorProducers.origin, output: "point" },
    invert({ target, output }) {
      const desired = instant(target);
      const current = value<ConstructionPoint>(output, "origin Point");
      return desired !== undefined && desired.frame === current.frame ? [{}] : [];
    },
    trace({ output }) {
      const held = value<ConstructionPoint>(output, "origin Point");
      return { kind: "instant", expression: "timeline.start", reference: "timeline.start", frame: held.frame,
        source: { scope: "construction", type: output.type, kind: "construction", id: "start" }, authority: { kind: "fixed" } };
    },
  }, ...[timelineAuthorProducers.earliest, timelineAuthorProducers.latest].map((producer): StudioTemporalRelationCompanion => ({
    id: producer.name, match: { producer, output: "point" },
    invert({ target, output }) {
      const desired = instant(target);
      const current = value<ConstructionPoint>(output, "aggregate Point");
      return desired !== undefined && desired.frame === current.frame ? [{}] : [];
    },
    trace({ output, trace }) {
      const held = value<ConstructionPoint>(output, "aggregate Point");
      const candidates = [pointTrace(trace("left")), pointTrace(trace("right"))]
        .filter((point): point is StudioTemporalInstantProjection => point !== undefined && point.frame === held.frame);
      return candidates.length === 1 ? candidates[0] : {
        kind: "instant", expression: `${held.frame}f`, reference: "absolute", frame: held.frame,
        source: { scope: "construction", type: output.type, kind: "construction", id: output.record }, authority: { kind: "fixed" },
      };
    },
  })),
];
