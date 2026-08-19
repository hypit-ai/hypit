import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { momentFrames, segmentFrameSpan, selectionFrameSpans } from "@hypit/semantic-map";
import type { CompleteSemanticMap } from "@hypit/semantic-map";

import type {
  LocatedMomentOccurrence,
  LocatedProgramOccurrence,
  LocatedSegmentOccurrence,
  LocatedSelectionOccurrence,
} from "./types.js";

function occurrenceIdentity(owner: string, occurrence: number, seen: Set<number>): string {
  if (!Number.isSafeInteger(occurrence) || occurrence < 0) {
    throw new Error(`${owner} contains an invalid occurrence identity.`);
  }
  if (seen.has(occurrence)) throw new Error(`${owner} contains duplicate occurrence ${occurrence}.`);
  seen.add(occurrence);
  return `${owner}#${occurrence}`;
}

function assertLocatedFrame(frame: number, totalFrames: number, label: string): void {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > totalFrames) {
    throw new Error(`${label} is outside ProgramSpace.`);
  }
}

export function locateSelectionOccurrences(
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  space: ProgramSpace,
): readonly LocatedSelectionOccurrence[] {
  assertProgramSpaceIdentity(space);
  const totalFrames = programSpaceFrameCount(space);
  const spans = selectionFrameSpans(map, selection);
  if (spans.length !== selection.occurrences.length) {
    throw new Error(`NarrativeSelection ${selection.id} location cardinality changed.`);
  }
  const seen = new Set<number>();
  return spans.map((span, index) => {
    const occurrence = selection.occurrences[index];
    if (occurrence === undefined) throw new Error(`NarrativeSelection ${selection.id} occurrence is missing.`);
    assertLocatedFrame(span.startFrame, totalFrames, `NarrativeSelection ${selection.id} start`);
    assertLocatedFrame(span.endFrameExclusive, totalFrames, `NarrativeSelection ${selection.id} end`);
    return {
      id: occurrenceIdentity(selection.id, occurrence.occurrence, seen),
      occurrence: occurrence.occurrence,
      start: { frame: span.startFrame },
      end: { frame: span.endFrameExclusive },
    };
  });
}

export function locateMomentOccurrences(
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
  space: ProgramSpace,
): readonly LocatedMomentOccurrence[] {
  assertProgramSpaceIdentity(space);
  const totalFrames = programSpaceFrameCount(space);
  const frames = momentFrames(map, moment);
  if (frames.length !== moment.occurrences.length) {
    throw new Error(`NarrativeMoment ${moment.id} location cardinality changed.`);
  }
  const seen = new Set<number>();
  return frames.map((frame, index) => {
    const occurrence = moment.occurrences[index];
    if (occurrence === undefined) throw new Error(`NarrativeMoment ${moment.id} occurrence is missing.`);
    assertLocatedFrame(frame, totalFrames, `NarrativeMoment ${moment.id} cue`);
    return {
      id: occurrenceIdentity(moment.id, occurrence.occurrence, seen),
      occurrence: occurrence.occurrence,
      cue: { frame },
    };
  });
}

export function locateProgramOccurrence(space: ProgramSpace): LocatedProgramOccurrence {
  assertProgramSpaceIdentity(space);
  return { id: "program", start: { frame: 0 }, end: { frame: programSpaceFrameCount(space) } };
}

export function locateSegmentOccurrence(
  map: CompleteSemanticMap,
  segment: NarrativeExcerpt,
  space: ProgramSpace,
): LocatedSegmentOccurrence {
  assertProgramSpaceIdentity(space);
  const totalFrames = programSpaceFrameCount(space);
  const span = segmentFrameSpan(map, segment);
  assertLocatedFrame(span.startFrame, totalFrames, `Narrative Segment ${segment.id} start`);
  assertLocatedFrame(span.endFrameExclusive, totalFrames, `Narrative Segment ${segment.id} end`);
  if (span.endFrameExclusive <= span.startFrame) throw new Error(`Narrative Segment ${segment.id} has no positive frame span.`);
  return {
    id: segment.id,
    start: { frame: span.startFrame },
    end: { frame: span.endFrameExclusive },
  };
}
