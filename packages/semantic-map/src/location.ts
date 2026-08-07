import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import { assertProgramSpaceIdentity } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "./types.js";

export type LocatedFrameSpan = { readonly startFrame: number; readonly endFrameExclusive: number };

export function assertCompleteSemanticMapIdentity(map: CompleteSemanticMap): void {
  if (map.contract !== "svml.complete-semantic-map@1") {
    throw new Error("Unsupported CompleteSemanticMap contract");
  }
}

export function assertNarrativeSelectionIdentity(selection: NarrativeSelectionRef): void {
  if (
    selection.contract !== "svml.narrative-selection@1"
    || selection.id.length === 0
    || selection.occurrences.length === 0
  ) {
    throw new Error("NarrativeSelection is invalid");
  }
}

export function assertNarrativeMomentIdentity(moment: NarrativeMomentRef): void {
  if (
    moment.contract !== "svml.narrative-moment@1"
    || moment.id.length === 0
    || moment.occurrences.length === 0
  ) {
    throw new Error("NarrativeMoment is invalid");
  }
}

/**
 * Every marker resolved its affinity to one of the map's 2M+2N anchors while the
 * Script was parsed, where the surrounding structure was known. Locating is a
 * lookup: Token cuts and Segment cuts are equal citizens here.
 */
function anchorFrames(map: CompleteSemanticMap): ReadonlyMap<string, number> {
  return new Map(map.anchors.map((anchor) => [anchor.identity, anchor.frame]));
}

function frameFor(frames: ReadonlyMap<string, number>, anchorId: string, owner: string): number {
  const frame = frames.get(anchorId);
  if (frame === undefined) {
    throw new Error(`${owner} names anchor ${anchorId}, which this SemanticMap does not contain`);
  }
  return frame;
}

/** Project every occurrence of one Script Selection onto one measured SemanticMap. */
export function selectionFrameSpans(
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  programSpace: ProgramSpace,
): readonly LocatedFrameSpan[] {
  assertCompleteSemanticMapIdentity(map);
  assertNarrativeSelectionIdentity(selection);
  assertProgramSpaceIdentity(programSpace);
  const frames = anchorFrames(map);
  return selection.occurrences.map((occurrence) => {
    const startFrame = frameFor(frames, occurrence.open.boundary.anchorId, `NarrativeSelection ${selection.id}`);
    const endFrameExclusive = frameFor(frames, occurrence.close.boundary.anchorId, `NarrativeSelection ${selection.id}`);
    if (endFrameExclusive <= startFrame) {
      throw new Error(`NarrativeSelection ${selection.id} contains an empty located occurrence`);
    }
    return { startFrame, endFrameExclusive };
  });
}

/** Project every occurrence of one Script Moment onto one measured SemanticMap. */
export function momentFrames(
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
  programSpace: ProgramSpace,
): readonly number[] {
  assertCompleteSemanticMapIdentity(map);
  assertNarrativeMomentIdentity(moment);
  assertProgramSpaceIdentity(programSpace);
  const frames = anchorFrames(map);
  return moment.occurrences.map((occurrence) =>
    frameFor(frames, occurrence.boundary.anchorId, `NarrativeMoment ${moment.id}`));
}
