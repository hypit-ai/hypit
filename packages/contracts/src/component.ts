import type { Digest, StoredValue, TypeRef } from "@svml/protocol";

import {
  verifyMediaInspection,
  verifyMediaStreamSelection,
  verifyMuxedMedia,
  verifyRenderedVisual,
  verifySynchronizedMedia,
  verifyTimelineAudio,
} from "./media-identity.js";
import {
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
  installValidators(registry: {
    register(
      type: TypeRef,
      implementationDigest: Digest,
      handler: (context: { readonly value: StoredValue }) => void,
    ): void;
  }): void {
    registry.register(contractTypes.mediaInspection, mediaValidatorDigests.inspection, ({ value }) => {
      verifyMediaInspection(inline(value, "MediaInspection"));
    });
    registry.register(contractTypes.mediaStreamSelection, mediaValidatorDigests.selection, ({ value }) => {
      verifyMediaStreamSelection(inline(value, "MediaStreamSelection"));
    });
    registry.register(contractTypes.synchronizedMedia, mediaValidatorDigests.synchronized, ({ value }) => {
      verifySynchronizedMedia(inline(value, "SynchronizedMedia"));
    });
    registry.register(contractTypes.renderedVisual, mediaValidatorDigests.renderedVisual, ({ value }) => {
      verifyRenderedVisual(inline(value, "RenderedVisual"));
    });
    registry.register(contractTypes.timelineAudio, mediaValidatorDigests.timelineAudio, ({ value }) => {
      verifyTimelineAudio(inline(value, "TimelineAudio"));
    });
    registry.register(contractTypes.muxedMedia, mediaValidatorDigests.muxedMedia, ({ value }) => {
      verifyMuxedMedia(inline(value, "MuxedMedia"));
    });
  },
};
