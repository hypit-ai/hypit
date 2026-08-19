import type { ComponentPackage } from "@hypit/component-kit";
import type { BlobRef, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";
import { rasterTransformRequest } from "@hypit/raster";

import { imageTransformProducers, imageTransformTypes } from "./manifest.js";
import { verifyImageTransformProgram } from "./program.js";
import type { ImageTransformProgram } from "./types.js";

function inline(value: StoredValue | undefined, subject: string): ImageTransformProgram {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as ImageTransformProgram;
}

function blob(value: StoredValue | undefined, subject: string): BlobRef {
  if (value?.kind !== "blob") throw new Error(`${subject} must be a BlobArtifact`);
  if (!value.mediaType.startsWith("image/")) throw new Error(`${subject} must be image media`);
  return value;
}

export const imageTransformComponent = {
  validators: [{
    type: imageTransformTypes.program,
    handler: ({ value }) => {
      verifyImageTransformProgram(inline(value, "ImageTransformProgram"));
    },
  }],
  producers: [{
    producer: imageTransformProducers.request,
    handler: ({ inputs }) => {
      const source = blob(inputs.source?.value, "ImageTransform source");
      const program = inline(inputs.program?.value, "ImageTransformProgram");
      verifyImageTransformProgram(program);
      return { outputs: {}, needs: { image: canonicalize(rasterTransformRequest(source, program.operations)) } };
    },
  }],
} satisfies ComponentPackage;
