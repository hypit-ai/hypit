import { canonicalize, digestOf, isDigest } from "@svml/protocol";

import { assertProgramSpaceIdentity, programSpaceFrameCount } from "./identity.js";
import type { NarrativeSelectionRef } from "./narrative.js";
import type { CompleteSemanticMap } from "./speech.js";
import type { FrameSpan } from "./track.js";

export function assertCompleteSemanticMapIdentity(map: CompleteSemanticMap): void {
  if (map.contract !== "svml.complete-semantic-map@1") {
    throw new Error("Unsupported CompleteSemanticMap contract");
  }
  assertProgramSpaceIdentity(map.programSpace);
  const { mapDigest: _digest, ...content } = map;
  if (!isDigest(map.mapDigest) || map.mapDigest !== digestOf(canonicalize(content))) {
    throw new Error("CompleteSemanticMap digest differs from its contents");
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
  const { selectionDigest: _digest, ...content } = selection;
  if (!isDigest(selection.selectionDigest) || selection.selectionDigest !== digestOf(canonicalize(content))) {
    throw new Error("NarrativeSelection digest differs from its contents");
  }
}

function boundaryFrame(
  map: CompleteSemanticMap,
  edge: NarrativeSelectionRef["occurrences"][number]["open"],
  side: "open" | "close",
): number {
  const index = edge.boundary.tokenIndex;
  if (side === "open") {
    if (edge.affinity === "left" && index > 0) return map.tokens[index - 1]?.startFrame ?? 0;
    return map.tokens[index]?.startFrame ?? programSpaceFrameCount(map.programSpace);
  }
  if (edge.affinity === "right" && index < map.tokens.length) {
    return map.tokens[index]?.endFrame ?? programSpaceFrameCount(map.programSpace);
  }
  return index > 0 ? map.tokens[index - 1]?.endFrame ?? 0 : 0;
}

/** Project every occurrence of one Script Selection onto one measured SemanticMap. */
export function selectionFrameSpans(
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
): readonly FrameSpan[] {
  assertCompleteSemanticMapIdentity(map);
  assertNarrativeSelectionIdentity(selection);
  return selection.occurrences.map((occurrence) => {
    const startFrame = boundaryFrame(map, occurrence.open, "open");
    const endFrameExclusive = boundaryFrame(map, occurrence.close, "close");
    if (endFrameExclusive <= startFrame) {
      throw new Error(`NarrativeSelection ${selection.id} contains an empty located occurrence`);
    }
    return { startFrame, endFrameExclusive };
  });
}
