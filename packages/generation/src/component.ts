import type { ComponentPackage } from "@hypit/component-kit";

import {
  verifyGeneratedAudioSet,
  verifyGeneratedImageSet,
  verifyGeneratedVideoSet,
} from "./identity.js";
import { generationProducers, generationTypes } from "./manifest.js";

function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

function primary(
  value: { readonly kind: string; readonly value?: unknown },
  kind: "audio" | "image" | "video",
): import("@hypit/protocol").BlobRef {
  const label = kind === "audio" ? "Audio" : kind === "image" ? "Image" : "Video";
  const content = inline(value, `Generated${label}Set`) as {
    readonly images?: readonly import("@hypit/protocol").BlobRef[];
    readonly videos?: readonly import("@hypit/protocol").BlobRef[];
    readonly audios?: readonly import("@hypit/protocol").BlobRef[];
  };
  const selected = kind === "audio"
    ? content.audios?.[0]
    : kind === "image" ? content.images?.[0] : content.videos?.[0];
  if (selected === undefined) throw new Error(`Generated ${kind} set has no primary artifact`);
  return selected;
}

/** Host-side semantic refinements for the shared generated-media contracts. */
export const generationComponent = {
  producers: [
    {
      producer: generationProducers.primaryAudio,
      handler: ({ inputs }) => ({
        outputs: { audio: primary(inputs.set!.value, "audio") },
        needs: {},
      }),
    },
    {
      producer: generationProducers.primaryImage,
      handler: ({ inputs }) => ({
        outputs: { image: primary(inputs.set!.value, "image") },
        needs: {},
      }),
    },
    {
      producer: generationProducers.primaryVideo,
      handler: ({ inputs }) => ({
        outputs: { video: primary(inputs.set!.value, "video") },
        needs: {},
      }),
    },
  ],
  validators: [
    {
      type: generationTypes.audioSet,
      handler: ({ value }) => {
        verifyGeneratedAudioSet(inline(value, "GeneratedAudioSet"));
      },
    },
    {
      type: generationTypes.imageSet,
      handler: ({ value }) => {
        verifyGeneratedImageSet(inline(value, "GeneratedImageSet"));
      },
    },
    {
      type: generationTypes.videoSet,
      handler: ({ value }) => {
        verifyGeneratedVideoSet(inline(value, "GeneratedVideoSet"));
      },
    },
  ],
} satisfies ComponentPackage;
