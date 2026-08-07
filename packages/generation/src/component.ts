import type { ComponentPackage } from "@narratage/component-kit";

import {
  verifyGeneratedImageSet,
  verifyGeneratedVideoSet,
} from "./identity.js";
import {
  generationProducerDigests,
  generationProducers,
  generationTypes,
  generationValidatorDigests,
} from "./manifest.js";

function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

function primary(
  value: { readonly kind: string; readonly value?: unknown },
  kind: "image" | "video",
): import("@narratage/protocol").BlobRef {
  const content = inline(value, `Generated${kind === "image" ? "Image" : "Video"}Set`) as {
    readonly images?: readonly import("@narratage/protocol").BlobRef[];
    readonly videos?: readonly import("@narratage/protocol").BlobRef[];
  };
  const selected = kind === "image" ? content.images?.[0] : content.videos?.[0];
  if (selected === undefined) throw new Error(`Generated ${kind} set has no primary artifact`);
  return selected;
}

/** Host-side semantic refinements for the shared generated-media contracts. */
export const generationComponent = {
  name: "@narratage/generation",
  producers: [
    {
      producer: generationProducers.primaryImage,
      implementationDigest: generationProducerDigests.primaryImage,
      handler: ({ inputs }) => ({
        outputs: { image: primary(inputs.set!.value, "image") },
        needs: {},
      }),
    },
    {
      producer: generationProducers.primaryVideo,
      implementationDigest: generationProducerDigests.primaryVideo,
      handler: ({ inputs }) => ({
        outputs: { video: primary(inputs.set!.value, "video") },
        needs: {},
      }),
    },
  ],
  validators: [
    {
      type: generationTypes.imageSet,
      implementationDigest: generationValidatorDigests.imageSet,
      handler: ({ value }) => {
        verifyGeneratedImageSet(inline(value, "GeneratedImageSet"));
      },
    },
    {
      type: generationTypes.videoSet,
      implementationDigest: generationValidatorDigests.videoSet,
      handler: ({ value }) => {
        verifyGeneratedVideoSet(inline(value, "GeneratedVideoSet"));
      },
    },
  ],
} satisfies ComponentPackage;
