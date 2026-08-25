import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { SemanticTrack } from "@hypit/semantic-track";
import {
  composeTemporalWindow,
  projectMomentInstant,
  projectProgramInstant,
  projectSegmentInstant,
  projectSelectionInstant,
} from "@hypit/temporal";
import type { TemporalInstantExpression } from "@hypit/temporal";

export type TemporalWindowProjection = {
  readonly start: TemporalInstantExpression;
  readonly end: TemporalInstantExpression;
};

const fixed = { kind: "fixed" as const };

export function projectProgramInstantFixture(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: SemanticTrack;
  readonly projection: TemporalInstantExpression;
}) {
  return projectProgramInstant({ ...input, subjectId: input.subjectId ?? input.itemId, authority: fixed });
}

export function projectMomentInstantFixture(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: SemanticTrack;
  readonly moment: NarrativeMomentRef;
  readonly projection: TemporalInstantExpression;
}) {
  return projectMomentInstant({ ...input, subjectId: input.subjectId ?? input.itemId, authority: fixed });
}

export function projectProgramWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: SemanticTrack;
  readonly projection: TemporalWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectProgramInstant({ itemId: `${input.itemId}.start`, subjectId, semantic: input.semantic, projection: input.projection.start, authority: fixed }),
    projectProgramInstant({ itemId: `${input.itemId}.end`, subjectId, semantic: input.semantic, projection: input.projection.end, authority: fixed }));
}

export function projectSelectionWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: SemanticTrack;
  readonly selection: NarrativeSelectionRef;
  readonly projection: TemporalWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectSelectionInstant({ itemId: `${input.itemId}.start`, subjectId, semantic: input.semantic, selection: input.selection, projection: input.projection.start, authority: fixed }),
    projectSelectionInstant({ itemId: `${input.itemId}.end`, subjectId, semantic: input.semantic, selection: input.selection, projection: input.projection.end, authority: fixed }));
}

export function projectSegmentWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: SemanticTrack;
  readonly segment: NarrativeExcerpt;
  readonly projection: TemporalWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectSegmentInstant({ itemId: `${input.itemId}.start`, subjectId, semantic: input.semantic, segment: input.segment, projection: input.projection.start, authority: fixed }),
    projectSegmentInstant({ itemId: `${input.itemId}.end`, subjectId, semantic: input.semantic, segment: input.segment, projection: input.projection.end, authority: fixed }));
}

export function projectMomentWindow(input: {
  readonly itemId: string;
  readonly subjectId?: string;
  readonly semantic: SemanticTrack;
  readonly moment: NarrativeMomentRef;
  readonly projection: TemporalWindowProjection;
}) {
  const subjectId = input.subjectId ?? input.itemId;
  return composeTemporalWindow({ id: input.itemId, subjectId },
    projectMomentInstant({ itemId: `${input.itemId}.start`, subjectId, semantic: input.semantic, moment: input.moment, projection: input.projection.start, authority: fixed }),
    projectMomentInstant({ itemId: `${input.itemId}.end`, subjectId, semantic: input.semantic, moment: input.moment, projection: input.projection.end, authority: fixed }));
}
