import type { ComponentPackage } from "@hypit/component-kit";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";
import type { SemanticTake } from "@hypit/speech";
import type { ContentFit, SpatialFrame } from "@hypit/spatial";

import { speechTrackProducers } from "./manifest.js";
import { appendSpeechTrackTake, assembleSpeechTrack, createSpeechTrackSet } from "./program.js";
import { projectSpeechTrackVisual } from "./projection.js";
import type { SemanticTrack } from "@hypit/semantic-track";
import type { SpeechTrackHeader, SpeechTrackSet, SpeechTrackVisualSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const speechTrackComponent = {
  producers: [
    {
      producer: speechTrackProducers.createSet,
      handler: () => ({
        outputs: { set: { kind: "inline", value: canonicalize(createSpeechTrackSet()) } },
        needs: {},
      }),
    },
    {
      producer: speechTrackProducers.appendTake,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendSpeechTrackTake(
          inline<SpeechTrackSet>(inputs.set?.value, "SpeechTrackSet"),
          inline<SemanticTake>(inputs.take?.value, "SemanticTake"),
          inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
          inline<ContentFit>(inputs.fit?.value, "ContentFit"),
          inline<SpeechTrackVisualSpec>(inputs.visualSpec?.value, "SpeechTrackVisualSpec"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: speechTrackProducers.assembleTrack,
      handler: ({ inputs }) => ({
        outputs: { track: { kind: "inline", value: canonicalize(assembleSpeechTrack(
          inline<SpeechTrackHeader>(inputs.header?.value, "SpeechTrackHeader"),
          inline<SpeechTrackSet>(inputs.set?.value, "SpeechTrackSet"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: speechTrackProducers.projectVisual,
      handler: ({ inputs }) => ({
        outputs: { visual: { kind: "inline", value: canonicalize(projectSpeechTrackVisual(
          inline<SemanticTrack>(inputs.track?.value, "SemanticTrack"),
          inline<SpeechTrackSet>(inputs.set?.value, "SpeechTrackSet"),
        )) } },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
