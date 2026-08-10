import { sealGenerationPortRequest, sealGenerationPortTable } from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { digestOf } from "@narratage/protocol";

export const seedreamModuleRef = { name: "@narratage/seedream", version: "1" } as const;

export const seedream5LitePorts: GenerationPortTable = sealGenerationPortTable({
  contract: "svml.generation-ports@1",
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
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 16 },
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
export const seedreamSurfaceImplementationDigests = {
  textImage: digestOf("@narratage/seedream/text-image-surface@1"),
  referenceImage: digestOf("@narratage/seedream/reference-image-surface@1"),
} as const;
const endpoint = seedreamEndpoints.image!;
export const seedreamManifest = {
  ...seedreamBaseDefinition.manifest,
  surfaces: [{
    name: "text-image", tag: "TextImage", mode: "structured" as const,
    outputs: [endpoint.draftType],
    implementation: { kind: "trusted-frontend-surface" as const, locator: "@narratage/seedream/text-image-surface", digest: seedreamSurfaceImplementationDigests.textImage },
  }, {
    name: "reference-image", tag: "ReferenceImage", mode: "structured" as const,
    outputs: [endpoint.draftType, endpoint.mediaBindings.images!.type],
    implementation: { kind: "trusted-frontend-surface" as const, locator: "@narratage/seedream/reference-image-surface", digest: seedreamSurfaceImplementationDigests.referenceImage },
  }],
};
export const seedreamManifestDigest = digestOf(seedreamManifest);
export const seedreamDefinition = {
  ...seedreamBaseDefinition, manifest: seedreamManifest, manifestDigest: seedreamManifestDigest,
};
