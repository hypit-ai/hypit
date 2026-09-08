import type { VisualPresent } from "@hypit/composition";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import type { BlobRef } from "@hypit/protocol";
import { assertContentFit, assertIntrinsicExtent, assertSpatialFrame } from "@hypit/spatial";
import type { ContentFit, IntrinsicExtent, SpatialFrame } from "@hypit/spatial";

import { lowerMediaItemElements } from "./lower.js";
import type {
  MediaFramePresentation,
  MediaItemProgram,
  MediaLifecycleMotion,
  MediaPaintLayerSpec,
  MediaSampleAppearance,
  MediaSamplingMotion,
} from "./types.js";

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
  readonly presentation: MediaFramePresentation;
  readonly sampleAppearance: MediaSampleAppearance;
  readonly motion: MediaLifecycleMotion;
  readonly framePaint?: MediaPaintLayerSpec;
  readonly samplingMotion?: MediaSamplingMotion;
};

/**
 * Focused reuse point for Speech Track: one normalized muted Take and its
 * visual presentation inside a fixed Segment envelope, without Media Track
 * Window, playback/trim, source-audio or Sequence ownership.
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
      presentation: structuredClone(clip.presentation),
      layers: [
        ...(clip.framePaint === undefined ? [] : [{
          id: clip.framePaint.id,
          kind: "paint" as const,
          paint: structuredClone(clip.framePaint.paint),
          opacity: clip.framePaint.opacity,
        }]),
        {
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
          appearance: structuredClone(clip.sampleAppearance),
          ...(clip.samplingMotion === undefined ? {} : {
            samplingMotion: structuredClone(clip.samplingMotion),
          }),
        },
      ],
      motion: structuredClone(clip.motion),
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
