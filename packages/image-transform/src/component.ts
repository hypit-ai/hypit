import type { ComponentPackage } from "@svml/component-kit";
import type { BlobRef, StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import {
  imageTransformImplementationDigests,
  imageTransformProducers,
  imageTransformTypes,
} from "./manifest.js";
import { verifyImageTransformProgram } from "./program.js";
import type { ImageTransformProgram, ImageTransformRequest } from "./types.js";

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
  name: "@svml/image-transform",
  validators: [{
    type: imageTransformTypes.program,
    implementationDigest: imageTransformImplementationDigests.validator,
    handler: ({ value }) => {
      verifyImageTransformProgram(inline(value, "ImageTransformProgram"));
    },
  }],
  producers: [{
    producer: imageTransformProducers.request,
    implementationDigest: imageTransformImplementationDigests.request,
    handler: ({ inputs }) => {
      const source = blob(inputs.source?.value, "ImageTransform source");
      const program = inline(inputs.program?.value, "ImageTransformProgram");
      verifyImageTransformProgram(program);
      const request: ImageTransformRequest = {
        contract: "svml.image-transform-request@1",
        source,
        program,
      };
      return { outputs: {}, needs: { image: canonicalize(request) } };
    },
  }],
} satisfies ComponentPackage;
