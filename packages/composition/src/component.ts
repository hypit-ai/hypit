import type { ComponentPackage } from "@hypit/component-kit";
import { compositionTypes } from "./manifest.js";
import { assertAudioTrackIdentity, assertCompositionIdentity, assertVisualTrackIdentity } from "./track.js";
import type { AudioTrack, Composition, VisualTrack } from "./track.js";
function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown { if (value.kind !== "inline") throw new Error(`${subject} must be inline`); return value.value; }
export const compositionComponent = { validators: [
  { type: compositionTypes.visualTrack, handler: ({ value }) => assertVisualTrackIdentity(inline(value, "VisualTrack") as VisualTrack) },
  { type: compositionTypes.audioTrack, handler: ({ value }) => assertAudioTrackIdentity(inline(value, "AudioTrack") as AudioTrack) },
  { type: compositionTypes.composition, handler: ({ value }) => assertCompositionIdentity(inline(value, "Composition") as Composition) },
] } satisfies ComponentPackage;
