import type { NarrativeSegmentRef, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { Timeline } from "@hypit/timeline";
import {
  composeTemporalWindow,
  exactTemporalValueFromFrames,
  projectProgramInstant,
  scaleExactTemporalValue,
  sealTemporalMap,
  shiftTemporalInstant,
  temporalExtentFromDuration,
} from "@hypit/temporal";
import type { TemporalDuration, TemporalInstantExpression, TemporalMap } from "@hypit/temporal";
import { projectNarrativeInstant } from "@hypit/narrative-temporal";
import type { NarrativeProjection } from "@hypit/narrative-temporal";

export type TemporalWindowProjection = {
  readonly start: TemporalInstantExpression;
  readonly end: TemporalInstantExpression;
};

type FrameRate = { readonly numerator: number; readonly denominator: number };
type FrameRational = { readonly numerator: number; readonly denominator: number };

export function frameRangeFixture(startFrame: number, endFrameExclusive: number, frameRate: FrameRate) {
  return {
    start: exactTemporalValueFromFrames(startFrame, { frameRate }),
    end: exactTemporalValueFromFrames(endFrameExclusive, { frameRate }),
  };
}

function exactFramePosition(value: FrameRational, frameRate: FrameRate) {
  return scaleExactTemporalValue(exactTemporalValueFromFrames(value.numerator, { frameRate }),
    { numerator: 1, denominator: value.denominator });
}

/** Build exact test data from human-readable frame coordinates; production code never uses this adapter. */
export function frameSamplingMapFixture(input: {
  readonly targetId?: string;
  readonly sourceId?: string;
  readonly targetFrameRate: FrameRate;
  readonly targetFrames: number;
  readonly sourceFrameRate: FrameRate;
  readonly sourceFrames: number;
  readonly pieces: readonly {
    readonly target: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly sourceAtStart: FrameRational;
    readonly rate: FrameRational;
    readonly wrap?: { readonly startFrame: number; readonly endFrameExclusive: number };
  }[];
}): TemporalMap {
  const targetId = input.targetId ?? "fixture-occurrence";
  const sourceId = input.sourceId ?? "fixture-materialization";
  const target = { id: targetId,
    duration: exactTemporalValueFromFrames(input.targetFrames, { frameRate: input.targetFrameRate }) };
  const source = { id: sourceId,
    duration: exactTemporalValueFromFrames(input.sourceFrames, { frameRate: input.sourceFrameRate }) };
  return sealTemporalMap({ stages: [{ target, source,
    pieces: input.pieces.map((piece) => ({
      target: {
        start: exactTemporalValueFromFrames(piece.target.startFrame, { frameRate: input.targetFrameRate }),
        end: exactTemporalValueFromFrames(piece.target.endFrameExclusive, { frameRate: input.targetFrameRate }),
      },
      sourceAtStart: exactFramePosition(piece.sourceAtStart, input.sourceFrameRate),
      rate: piece.rate,
      ...(piece.wrap === undefined ? {} : { wrap: {
        start: exactTemporalValueFromFrames(piece.wrap.startFrame, { frameRate: input.sourceFrameRate }),
        end: exactTemporalValueFromFrames(piece.wrap.endFrameExclusive, { frameRate: input.sourceFrameRate }),
      } }),
    })),
  }] });
}
type NarrativeInstantExpression = {
  readonly ref: "selection.start" | "selection.end" | "segment.start" | "segment.end" | "moment.cue";
  readonly offset?: import("@hypit/temporal").TemporalDuration;
};
type NarrativeWindowProjection = { readonly start: NarrativeInstantExpression; readonly end: NarrativeInstantExpression };

export function projectProgramInstantFixture(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: Timeline;
  readonly projection: TemporalInstantExpression;
}) {
  return projectProgramInstant({ ...input, timeline: input.semantic, subjectId: input.subjectId ?? input.itemId });
}

export function projectMomentInstantFixture(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: Timeline;
  readonly narrative: NarrativeProjection;
  readonly moment: NarrativeMomentRef;
  readonly projection: NarrativeInstantExpression;
}) {
  return projectNarrativeFixture({ itemId: input.itemId, subjectId: input.subjectId ?? input.itemId,
    semantic: input.semantic, narrative: input.narrative, source: input.moment, sourceKind: "moment",
    expression: input.projection });
}

export function projectProgramWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: Timeline;
  readonly projection: TemporalWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectProgramInstant({ itemId: `${input.itemId}.start`, subjectId, timeline: input.semantic, projection: input.projection.start }),
    projectProgramInstant({ itemId: `${input.itemId}.end`, subjectId, timeline: input.semantic, projection: input.projection.end }));
}

export function projectSelectionWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: Timeline;
  readonly narrative: NarrativeProjection;
  readonly selection: NarrativeSelectionRef;
  readonly projection: NarrativeWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectNarrativeFixture({ itemId: `${input.itemId}.start`, subjectId, semantic: input.semantic,
      narrative: input.narrative, source: input.selection, sourceKind: "selection", expression: input.projection.start }),
    projectNarrativeFixture({ itemId: `${input.itemId}.end`, subjectId, semantic: input.semantic,
      narrative: input.narrative, source: input.selection, sourceKind: "selection", expression: input.projection.end }));
}

export function projectSegmentWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: Timeline;
  readonly narrative: NarrativeProjection;
  readonly segment: NarrativeSegmentRef;
  readonly projection: NarrativeWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectNarrativeFixture({ itemId: `${input.itemId}.start`, subjectId, semantic: input.semantic,
      narrative: input.narrative, source: input.segment, sourceKind: "segment", expression: input.projection.start }),
    projectNarrativeFixture({ itemId: `${input.itemId}.end`, subjectId, semantic: input.semantic,
      narrative: input.narrative, source: input.segment, sourceKind: "segment", expression: input.projection.end }));
}

export function projectMomentWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: Timeline;
  readonly narrative: NarrativeProjection;
  readonly moment: NarrativeMomentRef;
  readonly projection: NarrativeWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectNarrativeFixture({ itemId: `${input.itemId}.start`, subjectId, semantic: input.semantic,
      narrative: input.narrative, source: input.moment, sourceKind: "moment", expression: input.projection.start }),
    projectNarrativeFixture({ itemId: `${input.itemId}.end`, subjectId, semantic: input.semantic,
      narrative: input.narrative, source: input.moment, sourceKind: "moment", expression: input.projection.end }));
}

function narrativeSpec(id: string, subjectId: string, expression: NarrativeInstantExpression) {
  return { id, subjectId,
    boundary: expression.ref === "moment.cue" ? "cue" as const : expression.ref.endsWith(".start") ? "start" as const : "end" as const };
}

function positiveDuration(value: TemporalDuration): { readonly direction: 1 | -1; readonly duration: TemporalDuration } {
  const negative = value.unit === "seconds" ? value.numerator < 0 : value.value < 0;
  if (!negative) return { direction: 1, duration: value };
  return { direction: -1, duration: value.unit === "seconds"
    ? { ...value, numerator: Math.abs(value.numerator) }
    : { ...value, value: Math.abs(value.value) } };
}

function projectNarrativeFixture(input: {
  readonly itemId: string;
  readonly subjectId: string;
  readonly semantic: Timeline;
  readonly narrative: NarrativeProjection;
  readonly source: NarrativeSelectionRef | NarrativeSegmentRef | NarrativeMomentRef;
  readonly sourceKind: "selection" | "segment" | "moment";
  readonly expression: NarrativeInstantExpression;
}) {
  const base = projectNarrativeInstant({ narrative: input.narrative, source: input.source, sourceKind: input.sourceKind,
    spec: narrativeSpec(input.expression.offset === undefined ? input.itemId : `${input.itemId}.__base`,
      input.subjectId, input.expression) });
  if (input.expression.offset === undefined) return base;
  const offset = positiveDuration(input.expression.offset);
  return shiftTemporalInstant({ id: input.itemId, subjectId: input.subjectId, direction: offset.direction }, input.semantic,
    base, temporalExtentFromDuration(offset.duration, input.semantic));
}
