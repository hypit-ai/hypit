import { blobTypes } from "@hypit/hypit/blob";
import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/hypit/markup";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";
import { textTypes } from "@hypit/hypit/text";

export const nanoBananaModuleRef = { name: "@hypit/nano-banana", version: "1" } as const;
export const nanoBananaModels = ["nano-banana-2", "nano-banana-pro"] as const;
export type NanoBananaModel = typeof nanoBananaModels[number];

const NANO_BANANA_2_RATIOS = ["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5",
  "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"] as const;
const NANO_BANANA_PRO_RATIOS = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5",
  "5:4", "9:16", "16:9", "21:9"] as const;

function nanoBananaPortTable(model: NanoBananaModel): ModelFieldTable {
  const pro = model === "nano-banana-pro";
  return defineModelFields({
    model,
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: pro ? 10_000 : 20_000 }, minItems: 1, maxItems: 1 },
      { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: pro ? 8 : 14 },
      {
        name: "aspectRatio",
        value: {
          kind: "enum",
          values: pro ? [...NANO_BANANA_PRO_RATIOS] : [...NANO_BANANA_2_RATIOS],
        },
        minItems: 1,
        maxItems: 1,
      },
      { name: "resolution", value: { kind: "enum", values: ["1K", "2K", "4K"] }, minItems: 1, maxItems: 1 },
      { name: "outputFormat", value: { kind: "enum", values: ["png", "jpg"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const nanoBananaPorts: Readonly<Record<NanoBananaModel, ModelFieldTable>> = {
  "nano-banana-2": nanoBananaPortTable("nano-banana-2"),
  "nano-banana-pro": nanoBananaPortTable("nano-banana-pro"),
};

export function sealNanoBananaRequest(
  model: NanoBananaModel,
  ports: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(nanoBananaPorts[model], ports);
}

const nanoBananaBaseDefinition = defineFieldModelModule({
  module: nanoBananaModuleRef,
  endpoints: nanoBananaModels.map((model) => ({
    key: model === "nano-banana-2" ? "v2" : "pro",
    requestTypeName: model === "nano-banana-2" ? "NanoBanana2Request" : "NanoBananaProRequest",
    producerName: `request-${model}`,
    ports: nanoBananaPorts[model],
    result: standardGenerationResults.image,
  })),
});

export const nanoBananaEndpoints = nanoBananaBaseDefinition.endpoints;
export const nanoBananaComponent = nanoBananaBaseDefinition.component;
function nanoBananaAttributes(pro: boolean): readonly SurfaceAttributeVocabulary[] {
  return [
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
      values: pro ? [...NANO_BANANA_PRO_RATIOS] : [...NANO_BANANA_2_RATIOS],
    },
    {
      name: "resolution",
      kind: "literal",
      required: true,
      summary: "The size band the model renders at.",
      values: ["1K", "2K", "4K"],
    },
    {
      name: "output-format",
      kind: "literal",
      required: true,
      summary: "The encoding of the returned image Artifact.",
      values: ["png", "jpg"],
    },
  ];
}

const nanoBananaChildren: readonly SurfaceChildVocabulary[] = [
  { tag: "Reference", cardinality: "many",
    summary: "Attaches one image Artifact as a reference picture.",
    attributes: [
      { name: "image", kind: "reference", required: true, accepts: [blobTypes.blob],
        summary: "Selects the image Artifact this reference contributes." },
    ] },
];

const surface = (
  name: "image" | "pro-image",
  tag: "Image" | "ProImage",
  endpoint: (typeof nanoBananaEndpoints)["v2" | "pro"],
  pro: boolean,
  summary: string,
  example: string,
) => ({
  name,
  tag,
  mode: "structured" as const,
  outputs: [endpoint!.draftType, endpoint!.mediaBindings.images!.type],
  vocabulary: {
    summary,
    attributes: nanoBananaAttributes(pro),
    children: nanoBananaChildren,
    ports: [{
      name: "image",
      type: blobTypes.blob,
      summary: "The primary generated image, addressed as `<id>.image`.",
    }],
    example,
    notes: [
      `The element accepts at most ${pro ? 8 : 14} \`Reference\` children and no text content.`,
      "Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.",
      "The Surface lowers the element into the package's exact model request and selects no Provider.",
    ],
  },
});

export const nanoBananaMarkupSurfaces = [
    surface("image", "Image", nanoBananaEndpoints.v2!, false,
      "Generates one picture with the exact Nano Banana 2 model from a Text prompt and optional reference images.",
      `<nano:Image
  id="draft"
  prompt={prompt}
  aspect-ratio="9:16"
  resolution="2K"
  output-format="png"
>
  <nano:Reference image={person.image}/>
</nano:Image>`),
    surface("pro-image", "ProImage", nanoBananaEndpoints.pro!, true,
      "Generates one picture with the exact Nano Banana Pro model from a Text prompt and optional reference images.",
      `<nano:ProImage
  id="final"
  prompt={finalPrompt}
  aspect-ratio="9:16"
  resolution="4K"
  output-format="png"
/>`),
  ] as const;

export const nanoBananaManifest = {
  ...nanoBananaBaseDefinition.manifest,
};
export const nanoBananaDefinition = {
  ...nanoBananaBaseDefinition,
  manifest: nanoBananaManifest,
};
