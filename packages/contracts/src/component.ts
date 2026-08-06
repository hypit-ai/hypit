import type { ComponentPackage } from "@svml/component-kit";

import {
  verifyMediaInspection,
  verifyMediaStreamSelection,
  verifyMuxedMedia,
  verifyRenderedVisual,
  verifySynchronizedMedia,
  verifyTimelineAudio,
} from "./media-identity.js";
import {
  assertAudioTrackIdentity,
  assertCompositionIdentity,
  assertVisualTrackIdentity,
} from "./track.js";
import type {
  AudioTrack,
  Composition,
  VisualTrack,
} from "./track.js";
import {
  compositionValidatorDigests,
  contractTypes,
  mediaValidatorDigests,
} from "./manifest.js";

function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

/** Semantic refinements for digest-bound public media facts. */
export const mediaContractsComponent = {
  name: "@svml/media",
  validators: [
    {
      type: contractTypes.mediaInspection,
      implementationDigest: mediaValidatorDigests.inspection,
      handler: ({ value }) => verifyMediaInspection(inline(value, "MediaInspection")),
    },
    {
      type: contractTypes.mediaStreamSelection,
      implementationDigest: mediaValidatorDigests.selection,
      handler: ({ value }) => verifyMediaStreamSelection(inline(value, "MediaStreamSelection")),
    },
    {
      type: contractTypes.synchronizedMedia,
      implementationDigest: mediaValidatorDigests.synchronized,
      handler: ({ value }) => verifySynchronizedMedia(inline(value, "SynchronizedMedia")),
    },
    {
      type: contractTypes.renderedVisual,
      implementationDigest: mediaValidatorDigests.renderedVisual,
      handler: ({ value }) => verifyRenderedVisual(inline(value, "RenderedVisual")),
    },
    {
      type: contractTypes.timelineAudio,
      implementationDigest: mediaValidatorDigests.timelineAudio,
      handler: ({ value }) => verifyTimelineAudio(inline(value, "TimelineAudio")),
    },
    {
      type: contractTypes.muxedMedia,
      implementationDigest: mediaValidatorDigests.muxedMedia,
      handler: ({ value }) => verifyMuxedMedia(inline(value, "MuxedMedia")),
    },
  ],
} satisfies ComponentPackage;

/** Track values are self-validated; Composition repeats validation with the exact ProgramSpace. */
export const compositionContractsComponent = {
  name: "@svml/composition",
  validators: [
    {
      type: contractTypes.visualTrack,
      implementationDigest: compositionValidatorDigests.visualTrack,
      handler: ({ value }) => assertVisualTrackIdentity(inline(value, "VisualTrack") as VisualTrack),
    },
    {
      type: contractTypes.audioTrack,
      implementationDigest: compositionValidatorDigests.audioTrack,
      handler: ({ value }) => assertAudioTrackIdentity(inline(value, "AudioTrack") as AudioTrack),
    },
    {
      type: contractTypes.composition,
      implementationDigest: compositionValidatorDigests.composition,
      handler: ({ value }) => assertCompositionIdentity(inline(value, "Composition") as Composition),
    },
  ],
} satisfies ComponentPackage;

export const videoContractsComponents = [
  mediaContractsComponent,
  compositionContractsComponent,
] as const;
