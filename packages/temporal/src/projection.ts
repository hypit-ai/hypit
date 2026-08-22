import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";

import { locateMoment, locateProgram, locateSegment, locateSelection } from "./location.js";
import {
  add,
  compare,
  durationInFrames,
  maximum,
  minimum,
  quantizeBoundary,
  rational,
} from "./rational.js";
import type { Rational } from "./rational.js";
import type {
  FrameSpan,
  LocatedMoment,
  LocatedProgram,
  LocatedSegment,
  LocatedSelection,
  ProjectedWindow,
  TemporalSource,
  TemporalWindowSpec,
  TemporalPointExpression,
  TemporalWindowProjection,
  WindowRelation,
} from "./types.js";

type PointEnvironment = {
  readonly program: LocatedProgram;
  readonly selection?: LocatedSelection;
  readonly moment?: LocatedMoment;
  readonly segment?: LocatedSegment;
};

function evaluatePoint(
  expression: TemporalPointExpression,
  environment: PointEnvironment,
  space: ProgramSpace,
): Rational {
  if (expression.ref === "absolute") return durationInFrames(expression.at, space);
  let base: number;
  switch (expression.ref) {
    case "program.start": base = environment.program.start.frame; break;
    case "program.end": base = environment.program.end.frame; break;
    case "selection.start": {
      if (environment.selection === undefined) throw new Error("selection.start requires a Selection.");
      base = environment.selection.start.frame;
      break;
    }
    case "selection.end": {
      if (environment.selection === undefined) throw new Error("selection.end requires a Selection.");
      base = environment.selection.end.frame;
      break;
    }
    case "segment.start": {
      if (environment.segment === undefined) throw new Error("segment.start requires a Segment.");
      base = environment.segment.start.frame;
      break;
    }
    case "segment.end": {
      if (environment.segment === undefined) throw new Error("segment.end requires a Segment.");
      base = environment.segment.end.frame;
      break;
    }
    case "moment.cue": {
      if (environment.moment === undefined) throw new Error("moment.cue requires a Moment.");
      base = environment.moment.cue.frame;
      break;
    }
  }
  return expression.offset === undefined
    ? rational(BigInt(base))
    : add(rational(BigInt(base)), durationInFrames(expression.offset, space));
}

export function projectTemporalWindow(
  projection: TemporalWindowProjection,
  environment: PointEnvironment,
  space: ProgramSpace,
): FrameSpan {
  assertProgramSpaceIdentity(space);
  const totalFrames = programSpaceFrameCount(space);
  const rawStart = evaluatePoint(projection.start, environment, space);
  const rawEnd = evaluatePoint(projection.end, environment, space);
  if (compare(rawEnd, rawStart) < 0) throw new Error("Temporal projection produces a reversed raw window.");
  if (compare(rawEnd, rawStart) === 0) throw new Error("Temporal projection produces a zero raw window.");
  const lower = rational(0n);
  const upper = rational(BigInt(totalFrames));
  const clippedStart = maximum(rawStart, lower);
  const clippedEnd = minimum(rawEnd, upper);
  if (compare(clippedEnd, clippedStart) <= 0) {
    throw new Error("Temporal projection does not intersect ProgramSpace.");
  }
  const startFrame = quantizeBoundary(clippedStart);
  const endFrameExclusive = quantizeBoundary(clippedEnd);
  if (startFrame < 0 || endFrameExclusive > totalFrames || endFrameExclusive <= startFrame) {
    throw new Error("Temporal projection is shorter than one frame after quantization.");
  }
  return { startFrame, endFrameExclusive };
}

function projectedId(itemId: string, sourceId: string): string {
  if (itemId.length === 0) throw new Error("Projected item id must not be empty.");
  return `${itemId}::${sourceId}`;
}

function projectedWindow(
  spec: TemporalWindowSpec,
  source: TemporalSource,
  span: FrameSpan,
): ProjectedWindow {
  return {
    id: projectedId(spec.id, source.id),
    source: { ...source },
    projection: structuredClone(spec.projection),
    span: { ...span },
  };
}

export function projectSelectionWindow(input: {
  readonly itemId: string;
  readonly semantic: SemanticTrack;
  readonly selection: NarrativeSelectionRef;
  readonly projection: TemporalWindowProjection;
}): ProjectedWindow {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  const selection = locateSelection(input.semantic, input.selection);
  return projectedWindow(
    { id: input.itemId, projection: input.projection },
    { kind: "selection", id: selection.id },
    projectTemporalWindow(input.projection, { program, selection }, space),
  );
}

export function projectMomentWindow(input: {
  readonly itemId: string;
  readonly semantic: SemanticTrack;
  readonly moment: NarrativeMomentRef;
  readonly projection: TemporalWindowProjection;
}): ProjectedWindow {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  const moment = locateMoment(input.semantic, input.moment);
  return projectedWindow(
    { id: input.itemId, projection: input.projection },
    { kind: "moment", id: moment.id },
    projectTemporalWindow(input.projection, { program, moment }, space),
  );
}

export function projectProgramWindow(input: {
  readonly itemId: string;
  readonly semantic: SemanticTrack;
  readonly projection: TemporalWindowProjection;
}): ProjectedWindow {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  return projectedWindow(
    { id: input.itemId, projection: input.projection },
    { kind: "program", id: program.id },
    projectTemporalWindow(input.projection, { program }, space),
  );
}

export function projectSegmentWindow(input: {
  readonly itemId: string;
  readonly semantic: SemanticTrack;
  readonly segment: NarrativeExcerpt;
  readonly projection: TemporalWindowProjection;
}): ProjectedWindow {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  const segment = locateSegment(input.semantic, input.segment);
  return projectedWindow(
    { id: input.itemId, projection: input.projection },
    { kind: "segment", id: segment.id },
    projectTemporalWindow(input.projection, { program, segment }, space),
  );
}

export function assertWindowRelation(
  windows: readonly ProjectedWindow[],
  relation: WindowRelation,
): readonly ProjectedWindow[] {
  if (relation === "independent") return windows;
  const ordered = [...windows].sort((left, right) =>
    left.span.startFrame - right.span.startFrame
    || left.span.endFrameExclusive - right.span.endFrameExclusive
    || left.id.localeCompare(right.id));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous !== undefined && current !== undefined
      && current.span.startFrame < previous.span.endFrameExclusive) {
      throw new Error(`Temporal windows ${previous.id} and ${current.id} overlap under disjoint policy.`);
    }
  }
  return windows;
}
