import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { CompleteSemanticMap } from "./types.js";

export type LocatedFrameSpan = { readonly startFrame: number; readonly endFrameExclusive: number };

export function assertCompleteSemanticMapIdentity(map: CompleteSemanticMap): void {
  if (!Array.isArray(map.tokens) || !Array.isArray(map.anchors)) throw new Error("CompleteSemanticMap is invalid");
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

/**
 * Project every occurrence of one Script Selection onto one measured SemanticMap.
 *
 * One entry per occurrence, in Script order — the order the markers appear in the
 * source. Segments may overlap in time, so Script order is not necessarily time
 * order, and occurrences are located independently: they are never sorted,
 * merged, clipped against one another or otherwise reconciled. A caller that
 * needs time order sorts them itself.
 *
 * An occurrence whose two anchors meet or cross yields an empty or backwards
 * span, returned as located. What a Selection covering no frames should show is
 * a question about material, answered where that material is projected.
 */
export function selectionFrameSpans(
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
): readonly LocatedFrameSpan[] {
  assertCompleteSemanticMapIdentity(map);
  assertNarrativeSelectionIdentity(selection);
  const frames = anchorFrames(map);
  return selection.occurrences.map((occurrence) => {
    const startFrame = frameFor(frames, occurrence.startAnchorId, `NarrativeSelection ${selection.id}`);
    const endFrameExclusive = frameFor(frames, occurrence.endAnchorId, `NarrativeSelection ${selection.id}`);
    return { startFrame, endFrameExclusive };
  });
}

/** Locate one authored Segment by its two structural anchors. */
export function segmentFrameSpan(
  map: CompleteSemanticMap,
  segment: NarrativeExcerpt,
): LocatedFrameSpan {
  assertCompleteSemanticMapIdentity(map);
  if (segment.contract !== "svml.narrative-excerpt@1" || segment.kind !== "segment" || segment.id.length === 0) {
    throw new Error("Narrative Segment excerpt is invalid");
  }
  const frames = anchorFrames(map);
  return {
    startFrame: frameFor(frames, `segment:${segment.id}:start`, `Narrative Segment ${segment.id}`),
    endFrameExclusive: frameFor(frames, `segment:${segment.id}:end`, `Narrative Segment ${segment.id}`),
  };
}

/**
 * The measured window a run of Script tokens occupies: the first token's start
 * and the last token's end, exactly as located. Undefined when any named token
 * is absent, leaving the caller to decide what that means.
 *
 * This is the second way the same points are addressed. Markers address them by
 * anchor; a component that renders the Script text itself addresses them by
 * token, because its runs are computed rather than authored.
 */
export function tokenFrameSpan(
  map: CompleteSemanticMap,
  tokenIds: readonly string[],
): LocatedFrameSpan | undefined {
  assertCompleteSemanticMapIdentity(map);
  if (tokenIds.length === 0) return undefined;
  const timing = new Map(map.tokens.map((token) => [token.tokenId, token]));
  const located = tokenIds.map((id) => timing.get(id));
  if (located.some((token) => token === undefined)) return undefined;
  return {
    startFrame: located[0]!.startFrame,
    endFrameExclusive: located.at(-1)!.endFrameExclusive,
  };
}

/** Project every occurrence of one Script Moment onto one measured SemanticMap. */
export function momentFrames(
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
): readonly number[] {
  assertCompleteSemanticMapIdentity(map);
  assertNarrativeMomentIdentity(moment);
  const frames = anchorFrames(map);
  return moment.occurrences.map((occurrence) =>
    frameFor(frames, occurrence.anchorId, `NarrativeMoment ${moment.id}`));
}
