import type { VisualPresent } from "@hypit/composition";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import type { BlobRef } from "@hypit/protocol";
import { assertContentFit, assertIntrinsicExtent, assertSpatialFrame } from "@hypit/spatial";
import type { ContentFit, IntrinsicExtent, SpatialFrame } from "@hypit/spatial";

import { lowerMediaItemElements } from "./lower.js";
import type { MediaItemProgram } from "./types.js";

export type RestrictedSpeechVisualClip = {
  readonly id: string;
  readonly subjectId?: string;
  readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly artifact: BlobRef;
  readonly extent: IntrinsicExtent;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly frameCount: number;
  readonly frame: SpatialFrame;
  readonly fit: ContentFit;
  readonly stackingOrder: number;
};

/**
 * Focused reuse point for Speech Track: one normalized muted take and one
 * explicitly placed foreground layer, without Media Track motion or sequence
 * semantics.
 */
export function lowerRestrictedSpeechVisualPresents(
  trackId: string,
  space: ProgramSpace,
  clips: readonly RestrictedSpeechVisualClip[],
): readonly VisualPresent[] {
  assertProgramSpaceIdentity(space);
  if (!trackId) throw new Error("Restricted Speech visual requires an id.");
  const totalFrames = programSpaceFrameCount(space);
  return clips.map((clip, index) => {
    if (clip.artifact.kind !== "blob" || !clip.artifact.mediaType.startsWith("video/")) {
      throw new Error(`Speech visual ${clip.id} is not a normalized moving-video Blob.`);
    }
    assertIntrinsicExtent(clip.extent);
    assertSpatialFrame(clip.frame);
    assertContentFit(clip.fit);
    if (!Number.isSafeInteger(clip.stackingOrder)) throw new Error(`Speech visual ${clip.id} has an invalid stacking order.`);
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
      subjectId: clip.subjectId ?? clip.id,
      span: { ...clip.span },
      frame: structuredClone(clip.frame),
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
        fit: structuredClone(clip.fit),
        occupancy: { mode: "once", align: "start" },
        appearance: {
          opacity: 1,
          filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 },
        },
      }],
      motion: { sustain: [] },
      stacking: {
        order: clip.stackingOrder,
        tieBreak: `${trackId}:${String(index + 1).padStart(4, "0")}:${clip.id}`,
      },
      sounds: [],
    };
    return {
      id: item.id,
      subjectId: clip.subjectId ?? clip.id,
      span: { ...item.span },
      stacking: { ...item.stacking },
      elements: lowerMediaItemElements(item, space),
    };
  });
}
