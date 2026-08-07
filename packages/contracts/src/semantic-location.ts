import { assertProgramSpaceIdentity, programSpaceFrameCount } from "./identity.js";
import type { NarrativeSelectionRef } from "./narrative.js";
import type { CompleteSemanticMap, ProgramSpace } from "./speech.js";
import type { FrameSpan } from "./track.js";

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

function boundaryFrame(
  map: CompleteSemanticMap,
  programSpace: ProgramSpace,
  edge: NarrativeSelectionRef["occurrences"][number]["open"],
  side: "open" | "close",
): number {
  const index = edge.boundary.tokenIndex;
  if (side === "open") {
    if (edge.affinity === "left" && index > 0) return map.tokens[index - 1]?.startFrame ?? 0;
    return map.tokens[index]?.startFrame ?? programSpaceFrameCount(programSpace);
  }
  if (edge.affinity === "right" && index < map.tokens.length) {
    return map.tokens[index]?.endFrame ?? programSpaceFrameCount(programSpace);
  }
  return index > 0 ? map.tokens[index - 1]?.endFrame ?? 0 : 0;
}

/** Project every occurrence of one Script Selection onto one measured SemanticMap. */
export function selectionFrameSpans(
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  programSpace: ProgramSpace,
): readonly FrameSpan[] {
  assertCompleteSemanticMapIdentity(map);
  assertNarrativeSelectionIdentity(selection);
  assertProgramSpaceIdentity(programSpace);
  return selection.occurrences.map((occurrence) => {
    const startFrame = boundaryFrame(map, programSpace, occurrence.open, "open");
    const endFrameExclusive = boundaryFrame(map, programSpace, occurrence.close, "close");
    if (endFrameExclusive <= startFrame) {
      throw new Error(`NarrativeSelection ${selection.id} contains an empty located occurrence`);
    }
    return { startFrame, endFrameExclusive };
  });
}
