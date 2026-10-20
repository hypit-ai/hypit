import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";

import {
  verifyGeneratedAudioSet,
  verifyGeneratedImageSet,
  verifyGeneratedVideoSet,
} from "./identity.js";
import { generationProducers, generationTypes } from "./manifest.js";

function valueOf(value: Value | undefined, subject: string): unknown {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value;
}

function primary(
  value: Value,
  kind: "audio" | "image" | "video",
): import("@hypit/hypit/protocol").BlobRef {
  const label = kind === "audio" ? "Audio" : kind === "image" ? "Image" : "Video";
  const content = valueOf(value, `Generated${label}Set`) as {
    readonly images?: readonly import("@hypit/hypit/protocol").BlobRef[];
    readonly videos?: readonly import("@hypit/hypit/protocol").BlobRef[];
    readonly audios?: readonly import("@hypit/hypit/protocol").BlobRef[];
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
      handler: ({ inputs }) => ({ kind: "output", value: primary(inputs.set!.value, "audio") }),
    },
    {
      producer: generationProducers.primaryImage,
      handler: ({ inputs }) => ({ kind: "output", value: primary(inputs.set!.value, "image") }),
    },
    {
      producer: generationProducers.primaryVideo,
      handler: ({ inputs }) => ({ kind: "output", value: primary(inputs.set!.value, "video") }),
    },
  ],
  refinements: [
    {
      type: generationTypes.audioSet,
      handler: ({ value }) => {
        verifyGeneratedAudioSet(valueOf(value, "GeneratedAudioSet"));
      },
    },
    {
      type: generationTypes.imageSet,
      handler: ({ value }) => {
        verifyGeneratedImageSet(valueOf(value, "GeneratedImageSet"));
      },
    },
    {
      type: generationTypes.videoSet,
      handler: ({ value }) => {
        verifyGeneratedVideoSet(valueOf(value, "GeneratedVideoSet"));
      },
    },
  ],
} satisfies ProducerPackage & RefinementPackage;
