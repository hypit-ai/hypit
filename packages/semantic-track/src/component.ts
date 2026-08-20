import type { ComponentPackage } from "@hypit/component-kit";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { semanticTrackProducers } from "./manifest.js";
import { projectSemanticAudioTrack, projectSemanticProgramSpace } from "./projection.js";
import type { SemanticTrack } from "./types.js";

function track(value: StoredValue | undefined): SemanticTrack {
  if (value?.kind !== "inline") throw new Error("SemanticTrack must be inline.");
  return value.value as unknown as SemanticTrack;
}

export const semanticTrackComponent = {
  producers: [
    { producer: semanticTrackProducers.projectProgramSpace, handler: ({ inputs }) => ({ outputs: { space: { kind: "inline", value: canonicalize(projectSemanticProgramSpace(track(inputs.track?.value))) } }, needs: {} }) },
    { producer: semanticTrackProducers.projectAudio, handler: ({ inputs }) => ({ outputs: { audio: { kind: "inline", value: canonicalize(projectSemanticAudioTrack(track(inputs.track?.value))) } }, needs: {} }) },
  ],
} satisfies ComponentPackage;
