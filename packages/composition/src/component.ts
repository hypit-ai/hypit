import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";
import { compositionTypes } from "./manifest.js";
import { assertAudioTrackIdentity, assertCompositionIdentity, assertVisualTrackIdentity } from "./track.js";
import type { AudioTrack, Composition, VisualTrack } from "./track.js";
function valueOf(value: Value | undefined, subject: string): unknown { if (value === undefined) throw new Error(`${subject} is missing`); return value; }
export const compositionComponent = { refinements: [
  { type: compositionTypes.visualTrack, handler: ({ value }) => assertVisualTrackIdentity(valueOf(value, "VisualTrack") as VisualTrack) },
  { type: compositionTypes.audioTrack, handler: ({ value }) => assertAudioTrackIdentity(valueOf(value, "AudioTrack") as AudioTrack) },
  { type: compositionTypes.composition, handler: ({ value }) => assertCompositionIdentity(valueOf(value, "Composition") as Composition) },
] } satisfies ProducerPackage & RefinementPackage;
