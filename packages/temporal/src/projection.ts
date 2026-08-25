import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";

import { locateMoment, locateProgram, locateSegment, locateSelection } from "./location.js";
import { add, compare, durationInFrames, quantizeBoundary, rational } from "./rational.js";
import type { Rational } from "./rational.js";
import type {
  LocatedMoment,
  LocatedProgram,
  LocatedSegment,
  LocatedSelection,
  ProjectedInstant,
  ProjectedWindow,
  TemporalInstantExpression,
  TemporalInstant,
  TemporalInstantSpec,
  TemporalSource,
  TemporalWindow,
  TemporalWindowSpec,
  WindowRelation,
} from "./types.js";

export type TemporalConsumption = {
  readonly subjectId: string;
  readonly space?: ProgramSpace;
};

/** Verify the public identity carried across a Temporal consumer boundary. */
export function assertTemporalInstantFor(
  instant: TemporalInstant,
  expected: TemporalConsumption,
): void {
  if (!expected.subjectId || instant.subjectId !== expected.subjectId) {
    throw new Error(`Temporal Instant subject ${instant.subjectId} does not match ${expected.subjectId}.`);
  }
  if (!instant.source.spaceId || !instant.source.narrativeId) {
    throw new Error("Temporal Instant has no ProgramSpace identity.");
  }
  if (!Number.isSafeInteger(instant.frame) || instant.frame < 0) {
    throw new Error("Temporal Instant frame is invalid.");
  }
  if (expected.space !== undefined) {
    assertProgramSpaceIdentity(expected.space);
    if (instant.source.spaceId !== expected.space.id
      || instant.source.narrativeId !== expected.space.narrativeId) {
      throw new Error("Temporal Instant belongs to a different ProgramSpace or Narrative.");
    }
    if (instant.frame > programSpaceFrameCount(expected.space)) {
      throw new Error("Temporal Instant falls outside its ProgramSpace.");
    }
  }
}

/** Verify both endpoint provenance and the materialized span consumed by a domain program. */
export function assertTemporalWindowFor(
  window: TemporalWindow,
  expected: TemporalConsumption,
): void {
  if (window.subjectId !== expected.subjectId
    || window.start.subjectId !== expected.subjectId
    || window.end.subjectId !== expected.subjectId) {
    throw new Error(`Temporal Window subject ${window.subjectId} does not match ${expected.subjectId}.`);
  }
  assertTemporalInstantFor(window.start, expected);
  assertTemporalInstantFor(window.end, expected);
  if (window.start.source.spaceId !== window.end.source.spaceId
    || window.start.source.narrativeId !== window.end.source.narrativeId) {
    throw new Error("Temporal Window endpoints belong to different ProgramSpaces or Narratives.");
  }
  if (window.span.startFrame !== window.start.frame
    || window.span.endFrameExclusive !== window.end.frame
    || window.span.endFrameExclusive <= window.span.startFrame) {
    throw new Error("Temporal Window span disagrees with its endpoints.");
  }
}

type InstantEnvironment = {
  readonly program: LocatedProgram;
  readonly selection?: LocatedSelection;
  readonly moment?: LocatedMoment;
  readonly segment?: LocatedSegment;
};

function evaluateInstant(
  expression: TemporalInstantExpression,
  environment: InstantEnvironment,
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

export function projectTemporalInstant(
  projection: TemporalInstantExpression,
  environment: InstantEnvironment,
  space: ProgramSpace,
): number {
  assertProgramSpaceIdentity(space);
  const totalFrames = programSpaceFrameCount(space);
  const raw = evaluateInstant(projection, environment, space);
  const lower = rational(0n);
  const upper = rational(BigInt(totalFrames));
  if (compare(raw, lower) < 0 || compare(raw, upper) > 0) {
    throw new Error("Temporal Instant projection falls outside ProgramSpace.");
  }
  const frame = quantizeBoundary(raw);
  if (frame < 0 || frame > totalFrames) {
    throw new Error("Temporal Instant projection quantizes outside ProgramSpace.");
  }
  return frame;
}

function projectedId(itemId: string, sourceId: string): string {
  if (itemId.length === 0) throw new Error("Projected item id must not be empty.");
  return `${itemId}::${sourceId}`;
}

function projectedInstant(
  spec: TemporalInstantSpec,
  source: TemporalSource,
  frame: number,
): ProjectedInstant {
  return {
    id: projectedId(spec.id, source.id),
    subjectId: spec.subjectId,
    source: { ...source },
    projection: structuredClone(spec.projection),
    authority: structuredClone(spec.authority),
    frame,
  };
}

export function projectSelectionInstant(input: {
  readonly itemId: string;
  readonly subjectId: string;
  readonly semantic: SemanticTrack;
  readonly selection: NarrativeSelectionRef;
  readonly projection: TemporalInstantExpression;
  readonly authority: TemporalInstantSpec["authority"];
}): ProjectedInstant {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  const selection = locateSelection(input.semantic, input.selection);
  return projectedInstant(
    { id: input.itemId, subjectId: input.subjectId, projection: input.projection, authority: input.authority },
    { spaceId: space.id, narrativeId: space.narrativeId, kind: "selection", id: selection.id },
    projectTemporalInstant(input.projection, { program, selection }, space),
  );
}

export function projectMomentInstant(input: {
  readonly itemId: string;
  readonly subjectId: string;
  readonly semantic: SemanticTrack;
  readonly moment: NarrativeMomentRef;
  readonly projection: TemporalInstantExpression;
  readonly authority: TemporalInstantSpec["authority"];
}): ProjectedInstant {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  const moment = locateMoment(input.semantic, input.moment);
  return projectedInstant(
    { id: input.itemId, subjectId: input.subjectId, projection: input.projection, authority: input.authority },
    { spaceId: space.id, narrativeId: space.narrativeId, kind: "moment", id: moment.id },
    projectTemporalInstant(input.projection, { program, moment }, space),
  );
}

export function projectProgramInstant(input: {
  readonly itemId: string;
  readonly subjectId: string;
  readonly semantic: SemanticTrack;
  readonly projection: TemporalInstantExpression;
  readonly authority: TemporalInstantSpec["authority"];
}): ProjectedInstant {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  return projectedInstant(
    { id: input.itemId, subjectId: input.subjectId, projection: input.projection, authority: input.authority },
    { spaceId: space.id, narrativeId: space.narrativeId, kind: "program", id: program.id },
    projectTemporalInstant(input.projection, { program }, space),
  );
}

export function projectSegmentInstant(input: {
  readonly itemId: string;
  readonly subjectId: string;
  readonly semantic: SemanticTrack;
  readonly segment: NarrativeExcerpt;
  readonly projection: TemporalInstantExpression;
  readonly authority: TemporalInstantSpec["authority"];
}): ProjectedInstant {
  const space = projectSemanticProgramSpace(input.semantic);
  const program = locateProgram(input.semantic);
  const segment = locateSegment(input.semantic, input.segment);
  return projectedInstant(
    { id: input.itemId, subjectId: input.subjectId, projection: input.projection, authority: input.authority },
    { spaceId: space.id, narrativeId: space.narrativeId, kind: "segment", id: segment.id },
    projectTemporalInstant(input.projection, { program, segment }, space),
  );
}

export function composeTemporalWindow(
  spec: TemporalWindowSpec,
  start: ProjectedInstant,
  end: ProjectedInstant,
): ProjectedWindow {
  if (spec.id.length === 0) throw new Error("Temporal Window id must not be empty.");
  if (!spec.subjectId || start.subjectId !== spec.subjectId || end.subjectId !== spec.subjectId) {
    throw new Error("Temporal Window endpoints must explicitly name the Window subject.");
  }
  if (start.source.spaceId !== end.source.spaceId || start.source.narrativeId !== end.source.narrativeId) {
    throw new Error("Temporal Window endpoints must belong to one ProgramSpace and Narrative.");
  }
  if (end.frame < start.frame) throw new Error("Temporal Window endpoints are reversed.");
  if (end.frame === start.frame) throw new Error("Temporal Window endpoints produce a zero window.");
  return {
    id: spec.id,
    subjectId: spec.subjectId,
    start: structuredClone(start),
    end: structuredClone(end),
    span: { startFrame: start.frame, endFrameExclusive: end.frame },
  };
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
