import type { ComponentPackage } from "@narratage/component-kit";
import { compositionTypes, compositionValidatorDigests } from "./manifest.js";
import { assertAudioTrackIdentity, assertCompositionIdentity, assertVisualTrackIdentity } from "./track.js";
import type { AudioTrack, Composition, VisualTrack } from "./track.js";
function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown { if (value.kind !== "inline") throw new Error(`${subject} must be inline`); return value.value; }
export const compositionComponent = { name: "@narratage/composition", validators: [
  { type: compositionTypes.visualTrack, implementationDigest: compositionValidatorDigests.visualTrack, handler: ({ value }) => assertVisualTrackIdentity(inline(value, "VisualTrack") as VisualTrack) },
  { type: compositionTypes.audioTrack, implementationDigest: compositionValidatorDigests.audioTrack, handler: ({ value }) => assertAudioTrackIdentity(inline(value, "AudioTrack") as AudioTrack) },
  { type: compositionTypes.composition, implementationDigest: compositionValidatorDigests.composition, handler: ({ value }) => assertCompositionIdentity(inline(value, "Composition") as Composition) },
] } satisfies ComponentPackage;
