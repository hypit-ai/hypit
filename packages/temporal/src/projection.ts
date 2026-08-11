import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";

import { locateMomentOccurrences, locateProgramOccurrence, locateSegmentOccurrence, locateSelectionOccurrences } from "./location.js";
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
  LocatedMomentOccurrence,
  LocatedProgramOccurrence,
  LocatedSegmentOccurrence,
  LocatedSelectionOccurrence,
  OccurrenceExpansion,
  ProjectedOccurrence,
  TemporalPointExpression,
  TemporalWindowProjection,
  WindowRelation,
} from "./types.js";

type PointEnvironment = {
  readonly program: LocatedProgramOccurrence;
  readonly selection?: LocatedSelectionOccurrence;
  readonly moment?: LocatedMomentOccurrence;
  readonly segment?: LocatedSegmentOccurrence;
};

function usesLocalPoint(expression: TemporalPointExpression, source: "selection" | "moment"): boolean {
  return source === "selection"
    ? expression.ref === "selection.start" || expression.ref === "selection.end"
    : expression.ref === "moment.cue";
}

function selectOccurrences<T extends { readonly id: string }>(
  occurrences: readonly T[],
  expansion: OccurrenceExpansion,
  projection: TemporalWindowProjection,
  source: "selection" | "moment",
  owner: string,
): readonly T[] {
  if (expansion.kind === "one") {
    if (occurrences.length !== 1) {
      throw new Error(`${owner} requires exactly one occurrence; received ${occurrences.length}.`);
    }
    return occurrences;
  }
  if (occurrences.length === 0) throw new Error(`${owner} requires at least one occurrence.`);
  if (
    occurrences.length > 1
    && !usesLocalPoint(projection.start, source)
    && !usesLocalPoint(projection.end, source)
  ) {
    throw new Error(`${owner} cannot expand an occurrence-invariant projection with each.`);
  }
  return occurrences;
}

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
      if (environment.selection === undefined) throw new Error("selection.start requires a Selection occurrence.");
      base = environment.selection.start.frame;
      break;
    }
    case "selection.end": {
      if (environment.selection === undefined) throw new Error("selection.end requires a Selection occurrence.");
      base = environment.selection.end.frame;
      break;
    }
    case "segment.start": {
      if (environment.segment === undefined) throw new Error("segment.start requires a Segment occurrence.");
      base = environment.segment.start.frame;
      break;
    }
    case "segment.end": {
      if (environment.segment === undefined) throw new Error("segment.end requires a Segment occurrence.");
      base = environment.segment.end.frame;
      break;
    }
    case "moment.cue": {
      if (environment.moment === undefined) throw new Error("moment.cue requires a Moment occurrence.");
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

function projectedId(itemId: string, sourceOccurrenceId: string): string {
  if (itemId.length === 0) throw new Error("Projected item id must not be empty.");
  return `${itemId}::${sourceOccurrenceId}`;
}

export function projectSelectionWindows(input: {
  readonly itemId: string;
  readonly map: CompleteSemanticMap;
  readonly selection: NarrativeSelectionRef;
  readonly space: ProgramSpace;
  readonly expansion: OccurrenceExpansion;
  readonly projection: TemporalWindowProjection;
}): readonly ProjectedOccurrence[] {
  const program = locateProgramOccurrence(input.space);
  const occurrences = selectOccurrences(
    locateSelectionOccurrences(input.map, input.selection, input.space),
    input.expansion,
    input.projection,
    "selection",
    `Temporal item ${input.itemId}`,
  );
  return occurrences.map((occurrence) => ({
    id: projectedId(input.itemId, occurrence.id),
    sourceOccurrenceId: occurrence.id,
    span: projectTemporalWindow(input.projection, { program, selection: occurrence }, input.space),
  }));
}

export function projectMomentWindows(input: {
  readonly itemId: string;
  readonly map: CompleteSemanticMap;
  readonly moment: NarrativeMomentRef;
  readonly space: ProgramSpace;
  readonly expansion: OccurrenceExpansion;
  readonly projection: TemporalWindowProjection;
}): readonly ProjectedOccurrence[] {
  const program = locateProgramOccurrence(input.space);
  const occurrences = selectOccurrences(
    locateMomentOccurrences(input.map, input.moment, input.space),
    input.expansion,
    input.projection,
    "moment",
    `Temporal item ${input.itemId}`,
  );
  return occurrences.map((occurrence) => ({
    id: projectedId(input.itemId, occurrence.id),
    sourceOccurrenceId: occurrence.id,
    span: projectTemporalWindow(input.projection, { program, moment: occurrence }, input.space),
  }));
}

export function projectProgramWindow(input: {
  readonly itemId: string;
  readonly space: ProgramSpace;
  readonly projection: TemporalWindowProjection;
}): ProjectedOccurrence {
  const program = locateProgramOccurrence(input.space);
  return {
    id: projectedId(input.itemId, program.id),
    sourceOccurrenceId: program.id,
    span: projectTemporalWindow(input.projection, { program }, input.space),
  };
}

export function projectSegmentWindow(input: {
  readonly itemId: string;
  readonly map: CompleteSemanticMap;
  readonly segment: NarrativeExcerpt;
  readonly space: ProgramSpace;
  readonly projection: TemporalWindowProjection;
}): ProjectedOccurrence {
  const program = locateProgramOccurrence(input.space);
  const segment = locateSegmentOccurrence(input.map, input.segment, input.space);
  return {
    id: projectedId(input.itemId, segment.id),
    sourceOccurrenceId: segment.id,
    span: projectTemporalWindow(input.projection, { program, segment }, input.space),
  };
}

export function assertWindowRelation(
  occurrences: readonly ProjectedOccurrence[],
  relation: WindowRelation,
): readonly ProjectedOccurrence[] {
  if (relation === "independent") return occurrences;
  const ordered = [...occurrences].sort((left, right) =>
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
  return occurrences;
}
