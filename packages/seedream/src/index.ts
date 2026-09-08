import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const seedreamModuleRef = { name: "@hypit/seedream", version: "1" } as const;

export const seedream5LitePorts: GenerationPortTable = sealGenerationPortTable({
  model: "seedream-5-lite",
  result: "image",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 3_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"] },
      minItems: 1,
      maxItems: 1,
    },
    /** Basic renders 2K, high 3K and ultra 4K. */
    { name: "quality", value: { kind: "enum", values: ["basic", "high", "ultra"] }, minItems: 1, maxItems: 1 },
    { name: "outputFormat", value: { kind: "enum", values: ["png", "jpeg"] }, minItems: 1, maxItems: 1 },
    /** Explicit author choice; the Provider never silently changes this policy. */
    { name: "nsfwCheck", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 14 },
  ],
  requires: [],
});

export function sealSeedreamRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(seedream5LitePorts, ports);
}

const seedreamBaseDefinition = defineExactModelModule({
  module: seedreamModuleRef,
  endpoints: [{
    key: "image",
    requestTypeName: "Seedream5LiteRequest",
    producerName: "request-seedream-5-lite",
    ports: seedream5LitePorts,
  }],
});

export const seedreamEndpoints = seedreamBaseDefinition.endpoints;
export const seedreamComponent = seedreamBaseDefinition.component;
const endpoint = seedreamEndpoints.image!;

const seedreamAttributes: readonly SurfaceAttributeVocabulary[] = [
  {
    name: "id",
    kind: "identifier",
    required: true,
    summary: "Names this generation and prefixes the bindings it publishes.",
  },
  {
    name: "prompt",
    kind: "reference",
    required: true,
    summary: "The Text edge describing the picture the model renders.",
    accepts: [textTypes.text],
  },
  {
    name: "aspect-ratio",
    kind: "literal",
    required: true,
    summary: "The shape of the generated picture.",
    values: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"],
  },
  {
    name: "quality",
    kind: "literal",
    required: true,
    summary: "The render band the model works at, basic 2K, high 3K and ultra 4K.",
    values: ["basic", "high", "ultra"],
  },
  {
    name: "output-format",
    kind: "literal",
    required: true,
    summary: "The encoding of the returned image.",
    values: ["png", "jpeg"],
  },
  {
    name: "nsfw-check",
    kind: "literal",
    required: true,
    summary: "Whether the Provider applies its safety check to this request.",
    values: ["true", "false"],
  },
];

const seedreamImagePort = {
  name: "image",
  type: artifactTypes.blob,
  summary: "The primary generated image, addressed as `<id>.image`.",
} as const;

export const seedreamMarkupSurfaces = [{
    name: "text-image", tag: "TextImage", mode: "structured" as const,
    outputs: [endpoint.draftType],
    vocabulary: {
      summary: "Generates one picture with the exact Seedream 5 Lite model from a Text prompt alone.",
      attributes: seedreamAttributes,
      ports: [seedreamImagePort],
      example: `<seedream:TextImage
  id="scene"
  prompt={prompt}
  aspect-ratio="9:16"
  quality="high"
  output-format="png"
  nsfw-check="true"
/>`,
      notes: [
        "The element accepts no children; reference pictures belong to `ReferenceImage`.",
        "Every request field is written by the author; the Runtime chooses no model on the author's behalf.",
      ],
    },
  }, {
    name: "reference-image", tag: "ReferenceImage", mode: "structured" as const,
    outputs: [endpoint.draftType, endpoint.mediaBindings.images!.type],
    vocabulary: {
      summary: "Generates one picture with the exact Seedream 5 Lite model from a Text prompt and one or more reference images.",
      attributes: seedreamAttributes,
      children: [{
        tag: "Reference",
        cardinality: "many",
        summary: "Attaches one image Artifact to the request as a reference picture.",
        attributes: [{
          name: "image",
          kind: "reference",
          required: true,
          summary: "The Artifact supplied as a reference picture, which must carry image media.",
          accepts: [artifactTypes.blob],
        }],
      }],
      ports: [seedreamImagePort],
      example: `<seedream:ReferenceImage
  id="variation"
  prompt={variationPrompt}
  aspect-ratio="9:16"
  quality="high"
  output-format="png"
  nsfw-check="true"
>
  <seedream:Reference image={scene.image}/>
</seedream:ReferenceImage>`,
      notes: [
        "The element requires at least one `Reference` child and accepts at most 14.",
        "The Surface copies no runtime media into request metadata; every reference stays a graph edge.",
      ],
    },
  }] as const;

export const seedreamManifest = {
  ...seedreamBaseDefinition.manifest,
};
export const seedreamDefinition = {
  ...seedreamBaseDefinition, manifest: seedreamManifest,
};
