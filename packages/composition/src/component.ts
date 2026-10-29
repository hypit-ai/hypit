import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";
import { compositionTypes } from "./manifest.js";
import { assertAudioTrackIdentity, assertCompositionIdentity, assertVisualProcessEffect, assertVisualScopeIdentity, assertVisualTrackIdentity } from "./track.js";
import type { AudioTrack, Composition, VisualProcessEffect, VisualScope, VisualTrack } from "./track.js";
function valueOf(value: Value | undefined, subject: string): unknown { if (value === undefined) throw new Error(`${subject} is missing`); return value; }
export const compositionComponent = { refinements: [
  { type: compositionTypes.visualTrack, handler: ({ value }) => assertVisualTrackIdentity(valueOf(value, "VisualTrack") as VisualTrack) },
  { type: compositionTypes.audioTrack, handler: ({ value }) => assertAudioTrackIdentity(valueOf(value, "AudioTrack") as AudioTrack) },
  { type: compositionTypes.visualProcessEffect, handler: ({ value }) => assertVisualProcessEffect(valueOf(value, "VisualProcessEffect") as VisualProcessEffect) },
  { type: compositionTypes.visualScope, handler: ({ value }) => assertVisualScopeIdentity(valueOf(value, "VisualScope") as VisualScope) },
  { type: compositionTypes.composition, handler: ({ value }) => assertCompositionIdentity(valueOf(value, "Composition") as Composition) },
] } satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
