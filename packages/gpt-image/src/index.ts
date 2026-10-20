import { blobTypes } from "@hypit/hypit/blob";
import {
  sealModelFieldRequest,
  sealModelFieldBuilder,
  defineModelFields,
} from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/hypit/markup";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";
import { imageOperationsModuleRef, imageTransformTypes } from "@hypit/image-operations";
import { textTypes } from "@hypit/hypit/text";

export const gptImageModuleRef = { name: "@hypit/gpt-image", version: "1" } as const;

export const gptImage2Ports: ModelFieldTable = defineModelFields({
  model: "gpt-image-2",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: {
        kind: "enum",
        values: [
          "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16",
          "2:1", "1:2", "3:1", "1:3", "21:9", "9:21", "5:4", "4:5",
        ],
      },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["1K", "2K", "4K"] }, minItems: 1, maxItems: 1 },
    {
      name: "background",
      value: { kind: "enum", values: ["transparent", "opaque", "auto"] },
      minItems: 0,
      maxItems: 1,
    },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 16 },
  ],
  requires: [],
});

export function sealGptImage2Request(
  ports: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(gptImage2Ports, ports);
}

/** Scalar request seed; reference images are attached later by explicit graph edges. */
export function sealGptImage2Draft(
  ports: Readonly<Record<string, readonly ModelFieldValue[]>>,
) {
  return sealModelFieldBuilder(gptImage2Ports, ports);
}

const gptImageBaseDefinition = defineFieldModelModule({
  module: gptImageModuleRef,
  endpoints: [{
    key: "image",
    requestTypeName: "GptImage2Request",
    producerName: "request-gpt-image-2",
    ports: gptImage2Ports,
    result: standardGenerationResults.image,
  }],
});

export const gptImageEndpoints = gptImageBaseDefinition.endpoints;
export const gptImageComponent = gptImageBaseDefinition.component;
const gptImageAttributes: readonly SurfaceAttributeVocabulary[] = [
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
    values: [
      "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16",
      "2:1", "1:2", "3:1", "1:3", "21:9", "9:21", "5:4", "4:5",
    ],
  },
  {
    name: "resolution",
    kind: "literal",
    required: true,
    summary: "The model's output resolution tier.",
    values: ["1K", "2K", "4K"],
  },
  {
    name: "background",
    kind: "literal",
    required: false,
    summary: "Requests transparent pixels or a fully opaque generated picture.",
    values: ["transparent", "opaque", "auto"],
  },
];

const gptImageChildren: readonly SurfaceChildVocabulary[] = [
  { tag: "Reference", cardinality: "many",
    summary: "Attaches one image Artifact as a reference picture.",
    attributes: [
      { name: "image", kind: "reference", required: true, accepts: [blobTypes.blob],
        summary: "Selects the image Artifact this reference contributes." },
    ] },
];

const gptImageExample = `<gpt:Image
  id="holding"
  prompt={prompt}
  aspect-ratio="9:16"
  resolution="2K"
>
  <gpt:Reference image={person.image}/>
  <gpt:Reference image={product.image}/>
</gpt:Image>`;

const gptImageNotes: readonly string[] = [
  "The element accepts at most 16 `Reference` children and no text content.",
  "Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.",
];

const gptImageSurfaceDeclaration = {
  name: "image",
  tag: "Image",
  mode: "structured" as const,
  outputs: [gptImageEndpoints.image!.draftType, gptImageEndpoints.image!.mediaBindings.images!.type],
  vocabulary: {
    summary: "Generates one picture with the exact GPT Image 2 model from a Text prompt and optional reference images.",
    attributes: gptImageAttributes,
    children: gptImageChildren,
    ports: [{
      name: "image",
      type: blobTypes.blob,
      summary: "The primary generated image, addressed as `<id>.image`.",
    }],
    example: gptImageExample,
    notes: gptImageNotes,
  },
};

export const gptImageMarkupSurfaces = [gptImageSurfaceDeclaration] as const;

export const gptImageManifest = {
  ...gptImageBaseDefinition.manifest,
};
export const gptImageDefinition = {
  ...gptImageBaseDefinition,
  manifest: gptImageManifest,
};

/** Optional authoring submodule; the exact GPT model remains independent of post-processing. */
export const gptImageCleanModuleRef = { name: "@hypit/gpt-image/clean", version: "1" } as const;

export const gptImageCleanMarkupSurfaces = [{
    name: "image",
    tag: "Image",
    mode: "structured" as const,
    outputs: [
      gptImageEndpoints.image!.draftType,
      gptImageEndpoints.image!.mediaBindings.images!.type,
      imageTransformTypes.program,
    ],
    vocabulary: {
      summary: "Generates one picture with the exact GPT Image 2 model and runs this package's cleanup Program over it.",
      attributes: gptImageAttributes,
      children: gptImageChildren,
      ports: [{
        name: "image",
        type: blobTypes.blob,
        summary: "The cleaned image, addressed as `<id>.image`.",
      }],
      example: gptImageExample,
      notes: [
        ...gptImageNotes,
        "Generation and the shared Transform Need stay two visible operations in the graph.",
      ],
    },
  }] as const;

export const gptImageCleanManifest = {
  format: "hypit.module@1" as const,
  name: gptImageCleanModuleRef.name,
  version: gptImageCleanModuleRef.version,
  dependencies: [
    { module: gptImageModuleRef },
    { module: imageOperationsModuleRef },
  ],
  types: [],
  capabilities: [],
  producers: [],
};
export { gptImageCleanupProgram } from "./cleanup-program.js";
export { createGptImageCleanFragment } from "./fragment.js";
