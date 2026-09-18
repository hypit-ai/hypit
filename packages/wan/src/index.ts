import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfaceChildVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const wanModuleRef = { name: "@hypit/wan", version: "1" } as const;
export const wanModels = ["wan-2.7-image", "wan-2.7-image-pro"] as const;
export type WanModel = typeof wanModels[number];

/**
 * The model renders at one of these bands. It takes no aspect ratio: with input images the output
 * follows the last one, and a prompt-only request renders at the band's own framing.
 */
const WAN_RESOLUTIONS = ["1K", "2K"] as const;
const WAN_PRO_RESOLUTIONS = ["1K", "2K", "4K"] as const;

function wanPortTable(model: WanModel): GenerationPortTable {
  const pro = model === "wan-2.7-image-pro";
  return sealGenerationPortTable({
    model,
    result: "image",
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
      { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
      {
        name: "resolution",
        value: { kind: "enum", values: pro ? [...WAN_PRO_RESOLUTIONS] : [...WAN_RESOLUTIONS] },
        minItems: 0,
        maxItems: 1,
      },
      // One request renders up to four pictures, or up to twelve as a story-coherent set. The
      // model chooses how many of an image set it returns, so this names a ceiling.
      { name: "count", value: { kind: "number", integer: true, minimum: 1, maximum: 12 }, minItems: 0, maxItems: 1 },
      { name: "imageSet", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      { name: "extendedReasoning", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      { name: "watermark", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      { name: "seed", value: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 }, minItems: 0, maxItems: 1 },
    ],
    // An image set renders one storyline in several pictures, which is what extended reasoning
    // would otherwise shape for a single picture.
    requires: [{ kind: "atMostOneOf", ports: ["imageSet", "extendedReasoning"] }],
  });
}

export const wanPorts: Readonly<Record<WanModel, GenerationPortTable>> = {
  "wan-2.7-image": wanPortTable("wan-2.7-image"),
  "wan-2.7-image-pro": wanPortTable("wan-2.7-image-pro"),
};

export function sealWanRequest(
  model: WanModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(wanPorts[model], ports);
}

const wanBaseDefinition = defineExactModelModule({
  module: wanModuleRef,
  endpoints: wanModels.map((model) => ({
    key: model === "wan-2.7-image" ? "image" : "pro",
    requestTypeName: model === "wan-2.7-image" ? "WanImageRequest" : "WanProImageRequest",
    producerName: `request-${model}`,
    ports: wanPorts[model],
  })),
});

export const wanEndpoints = wanBaseDefinition.endpoints;
export const wanComponent = wanBaseDefinition.component;

function wanAttributes(pro: boolean): readonly SurfaceAttributeVocabulary[] {
  return [
    { name: "id", kind: "identifier", required: true,
      summary: "Names this generation and prefixes the bindings it publishes." },
    { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
      summary: "The Text edge describing the picture, the edit to make, or the storyline of an image set." },
    { name: "resolution", kind: "literal", required: false,
      values: pro ? [...WAN_PRO_RESOLUTIONS] : [...WAN_RESOLUTIONS],
      summary: "The size band the model renders at." },
    { name: "count", kind: "literal", required: false,
      summary: "How many pictures to render, up to four, or the ceiling of an image set." },
    { name: "image-set", kind: "literal", required: false, values: ["true", "false"],
      summary: "Renders one storyline as several pictures instead of one picture." },
    { name: "extended-reasoning", kind: "literal", required: false, values: ["true", "false"],
      summary: "Spends longer shaping a single picture before rendering it." },
    { name: "watermark", kind: "literal", required: false, values: ["true", "false"],
      summary: "Marks the returned pictures as AI generated." },
    { name: "seed", kind: "literal", required: false,
      summary: "Seeds the model's sampling so a rerun stays close to this one." },
  ];
}

const wanChildren: readonly SurfaceChildVocabulary[] = [
  { tag: "Reference", cardinality: "many",
    summary: "Attaches one image Artifact the model edits or draws on.",
    attributes: [
      { name: "image", kind: "reference", required: true, accepts: [artifactTypes.blob],
        summary: "Selects the image Artifact this reference contributes." },
    ] },
];

const surface = (
  name: "image" | "pro-image",
  tag: "Image" | "ProImage",
  endpoint: (typeof wanEndpoints)["image" | "pro"],
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
    attributes: wanAttributes(pro),
    children: wanChildren,
    ports: [{
      name: "image",
      type: artifactTypes.blob,
      summary: "The primary generated image, addressed as `<id>.image`.",
    }],
    example,
    notes: [
      "The element accepts at most 9 `Reference` children and no text content.",
      "With references present the output takes the shape of the last one; a prompt-only element renders at the band's own framing.",
      "The model reads exclusions from the prompt itself, so write them there.",
      "Every `Reference` is an ordinary image Artifact edge; the Surface copies no runtime media into request metadata.",
      "The Surface lowers the element into the package's exact model request and selects no Provider.",
    ],
  },
});

export const wanMarkupSurfaces = [
  surface("image", "Image", wanEndpoints.image!, false,
    "Generates pictures with the exact Wan 2.7 Image model from a Text prompt and optional reference images.",
    `<wan:Image
  id="draft"
  prompt={prompt}
  resolution="2K"
>
  <wan:Reference image={product.image}/>
</wan:Image>`),
  surface("pro-image", "ProImage", wanEndpoints.pro!, true,
    "Generates pictures with the exact Wan 2.7 Image Pro model from a Text prompt and optional reference images.",
    `<wan:ProImage
  id="hero"
  prompt={heroPrompt}
  resolution="4K"
/>`),
] as const;

export const wanManifest = {
  ...wanBaseDefinition.manifest,
};
export const wanDefinition = {
  ...wanBaseDefinition,
  manifest: wanManifest,
};
