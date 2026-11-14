import type { Value } from "@hypit/protocol";
import type { RefinementPackage } from "@hypit/refinement";

import { assertAudiovisualPictureOutput, type AudiovisualPictureOutput } from "./output.js";
import { audiovisualExecutionTypes } from "./manifest.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audiovisualExecutionComponent = {
  refinements: [{
    type: audiovisualExecutionTypes.pictureOutput,
    handler: ({ value }) => {
      assertAudiovisualPictureOutput(valueOf<AudiovisualPictureOutput>(value, "AudiovisualPictureOutput"));
    },
  }],
} satisfies { refinements: RefinementPackage };
