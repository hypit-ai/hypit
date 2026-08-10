import { sealGenerationPortRequest, sealGenerationPortTable } from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { digestOf } from "@narratage/protocol";

export const nanoBananaModuleRef = { name: "@narratage/nano-banana", version: "1" } as const;
export const nanoBananaModels = ["nano-banana-2", "nano-banana-pro"] as const;
export type NanoBananaModel = typeof nanoBananaModels[number];

function nanoBananaPortTable(model: NanoBananaModel): GenerationPortTable {
  return sealGenerationPortTable({
    contract: "svml.generation-ports@1",
    model,
    result: "image",
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
      { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 14 },
      {
        name: "aspectRatio",
        value: {
          kind: "enum",
          values: ["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5",
            "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"],
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

export const nanoBananaPorts: Readonly<Record<NanoBananaModel, GenerationPortTable>> = {
  "nano-banana-2": nanoBananaPortTable("nano-banana-2"),
  "nano-banana-pro": nanoBananaPortTable("nano-banana-pro"),
};

export function sealNanoBananaRequest(
  model: NanoBananaModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(nanoBananaPorts[model], ports);
}

const nanoBananaBaseDefinition = defineExactModelModule({
  module: nanoBananaModuleRef,
  endpoints: nanoBananaModels.map((model) => ({
    key: model === "nano-banana-2" ? "v2" : "pro",
    requestTypeName: model === "nano-banana-2" ? "NanoBanana2Request" : "NanoBananaProRequest",
    producerName: `request-${model}`,
    ports: nanoBananaPorts[model],
  })),
});

export const nanoBananaEndpoints = nanoBananaBaseDefinition.endpoints;
export const nanoBananaComponent = nanoBananaBaseDefinition.component;
export const nanoBananaSurfaceImplementationDigests = {
  image: digestOf("@narratage/nano-banana/image-surface@1"),
  proImage: digestOf("@narratage/nano-banana/pro-image-surface@1"),
} as const;
const surface = (
  name: "image" | "pro-image",
  tag: "Image" | "ProImage",
  endpoint: (typeof nanoBananaEndpoints)["v2" | "pro"],
  digest: (typeof nanoBananaSurfaceImplementationDigests)["image" | "proImage"],
) => ({
  name,
  tag,
  mode: "structured" as const,
  outputs: [endpoint!.draftType, endpoint!.mediaBindings.images!.type],
  implementation: {
    kind: "trusted-frontend-surface" as const,
    locator: `@narratage/nano-banana/${name}-surface`,
    digest,
  },
});
export const nanoBananaManifest = {
  ...nanoBananaBaseDefinition.manifest,
  surfaces: [
    surface("image", "Image", nanoBananaEndpoints.v2!, nanoBananaSurfaceImplementationDigests.image),
    surface("pro-image", "ProImage", nanoBananaEndpoints.pro!, nanoBananaSurfaceImplementationDigests.proImage),
  ],
};
export const nanoBananaManifestDigest = digestOf(nanoBananaManifest);
export const nanoBananaDefinition = {
  ...nanoBananaBaseDefinition,
  manifest: nanoBananaManifest,
  manifestDigest: nanoBananaManifestDigest,
};
