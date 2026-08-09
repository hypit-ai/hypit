import type { VisualPresent } from "@narratage/composition";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import type { BlobRef } from "@narratage/protocol";
import { assertCanvasSpace, assertContentFit, assertIntrinsicExtent } from "@narratage/spatial";
import type { CanvasSpace, ContentFit, IntrinsicExtent } from "@narratage/spatial";

import { lowerMediaItemElements } from "./lower.js";
import type { MediaItemProgram } from "./types.js";

export type RestrictedSpeechVisualClip = {
  readonly id: string;
  readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly artifact: BlobRef;
  readonly extent: IntrinsicExtent;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly frameCount: number;
};

/**
 * Focused reuse point for Speech Spine: one normalized muted take, one full-Canvas
 * foreground layer and no Media author semantics beyond the shared lowering laws.
 */
export function lowerRestrictedSpeechVisualPresents(
  trackId: string,
  space: ProgramSpace,
  canvas: CanvasSpace,
  clips: readonly RestrictedSpeechVisualClip[],
  fit: ContentFit,
): readonly VisualPresent[] {
  assertProgramSpaceIdentity(space);
  assertCanvasSpace(canvas);
  assertContentFit(fit);
  if (!trackId || clips.length === 0) throw new Error("Restricted Speech visual requires an id and clips.");
  const totalFrames = programSpaceFrameCount(space);
  return clips.map((clip, index) => {
    if (clip.artifact.kind !== "blob" || !clip.artifact.mediaType.startsWith("video/")) {
      throw new Error(`Speech visual ${clip.id} is not a normalized moving-video Blob.`);
    }
    assertIntrinsicExtent(clip.extent);
    if (clip.frameRate.numerator !== space.frameRate.numerator
      || clip.frameRate.denominator !== space.frameRate.denominator) {
      throw new Error(`Speech visual ${clip.id} is not normalized to ProgramSpace frame rate.`);
    }
    const duration = clip.span.endFrameExclusive - clip.span.startFrame;
    if (!Number.isSafeInteger(clip.span.startFrame) || !Number.isSafeInteger(clip.span.endFrameExclusive)
      || clip.span.startFrame < 0 || clip.span.endFrameExclusive > totalFrames || duration <= 0
      || clip.frameCount !== duration) {
      throw new Error(`Speech visual ${clip.id} does not exactly cover its Segment frame span.`);
    }
    const item: MediaItemProgram = {
      id: `${trackId}:${clip.id}`,
      sourceOccurrenceId: clip.id,
      span: { ...clip.span },
      frame: {
        contract: "svml.spatial-frame@1",
        xPx: 0,
        yPx: 0,
        widthPx: canvas.widthPx,
        heightPx: canvas.heightPx,
      },
      presentation: {
        clip: { kind: "frame" },
        padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
        shadows: [],
      },
      layers: [{
        id: `${trackId}:${clip.id}:foreground`,
        kind: "sample",
        source: {
          kind: "timed",
          artifact: structuredClone(clip.artifact),
          extent: structuredClone(clip.extent),
          frameRate: { ...clip.frameRate },
          frameCount: clip.frameCount,
        },
        fit: structuredClone(fit),
        occupancy: { mode: "once", align: "start" },
        appearance: {
          opacity: 1,
          filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 },
        },
      }],
      motion: { sustain: [] },
      stacking: {
        order: 0,
        tieBreak: `${trackId}:${String(index + 1).padStart(4, "0")}:${clip.id}`,
      },
      sounds: [],
    };
    return {
      id: item.id,
      span: { ...item.span },
      stacking: { ...item.stacking },
      elements: lowerMediaItemElements(item, space),
    };
  });
}
