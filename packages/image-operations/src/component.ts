import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { imageTransformRequest } from "./execution.js";

import { imageTransformProducers, imageTransformTypes } from "./manifest.js";
import { verifyImageTransformProgram } from "./program.js";
import type { ImageTransformProgram } from "./types.js";

function valueOf(value: Value | undefined, subject: string): ImageTransformProgram {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as unknown as ImageTransformProgram;
}

function blob(value: Value | undefined, subject: string): BlobRef {
  assertBlobRef(value, subject);
  if (!value.mediaType.startsWith("image/")) throw new Error(`${subject} must be image media`);
  return value;
}

export const imageTransformComponent = {
  refinements: [{
    type: imageTransformTypes.program,
    handler: ({ value }) => {
      verifyImageTransformProgram(valueOf(value, "ImageTransformProgram"));
    },
  }],
  producers: [{
    producer: imageTransformProducers.request,
    handler: ({ inputs }) => {
      const source = blob(inputs.source?.value, "ImageTransform source");
      const program = valueOf(inputs.program?.value, "ImageTransformProgram");
      verifyImageTransformProgram(program);
      return { kind: "need", constraints: canonicalize(imageTransformRequest(source, program.operations)) };
    },
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
