import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { programSpaceFrameCount } from "@hypit/program-space";
import {
  momentFrame,
  projectSemanticProgramSpace,
  segmentFrameSpan,
  selectionFrameSpan,
} from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";

import type {
  LocatedMoment,
  LocatedProgram,
  LocatedSegment,
  LocatedSelection,
} from "./types.js";

function assertLocatedFrame(frame: number, totalFrames: number, label: string): void {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > totalFrames) {
    throw new Error(`${label} is outside ProgramSpace.`);
  }
}

export function locateSelection(
  semantic: SemanticTrack,
  selection: NarrativeSelectionRef,
): LocatedSelection {
  const space = projectSemanticProgramSpace(semantic);
  const totalFrames = programSpaceFrameCount(space);
  const span = selectionFrameSpan(semantic, selection);
  assertLocatedFrame(span.startFrame, totalFrames, `NarrativeSelection ${selection.id} start`);
  assertLocatedFrame(span.endFrameExclusive, totalFrames, `NarrativeSelection ${selection.id} end`);
  return { id: selection.id, start: { frame: span.startFrame }, end: { frame: span.endFrameExclusive } };
}

export function locateMoment(
  semantic: SemanticTrack,
  moment: NarrativeMomentRef,
): LocatedMoment {
  const space = projectSemanticProgramSpace(semantic);
  const totalFrames = programSpaceFrameCount(space);
  const frame = momentFrame(semantic, moment);
  assertLocatedFrame(frame, totalFrames, `NarrativeMoment ${moment.id} cue`);
  return { id: moment.id, cue: { frame } };
}

export function locateProgram(semantic: SemanticTrack): LocatedProgram {
  const space = projectSemanticProgramSpace(semantic);
  return { id: "program", start: { frame: 0 }, end: { frame: programSpaceFrameCount(space) } };
}

export function locateSegment(
  semantic: SemanticTrack,
  segment: NarrativeExcerpt,
): LocatedSegment {
  const space = projectSemanticProgramSpace(semantic);
  const totalFrames = programSpaceFrameCount(space);
  const span = segmentFrameSpan(semantic, segment);
  assertLocatedFrame(span.startFrame, totalFrames, `Narrative Segment ${segment.id} start`);
  assertLocatedFrame(span.endFrameExclusive, totalFrames, `Narrative Segment ${segment.id} end`);
  if (span.endFrameExclusive <= span.startFrame) throw new Error(`Narrative Segment ${segment.id} has no positive frame span.`);
  return {
    id: segment.id,
    start: { frame: span.startFrame },
    end: { frame: span.endFrameExclusive },
  };
}
