import {
  sealGenerationPortRequest,
  sealGenerationRequestDraft,
  sealGenerationPortTable,
} from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { digestOf } from "@narratage/protocol";
import {
  imageTransformManifestDigest,
  imageTransformModuleRef,
  imageTransformTypes,
} from "@narratage/image-transform";

export const gptImageModuleRef = { name: "@narratage/gpt-image", version: "1" } as const;

export const gptImage2Ports: GenerationPortTable = sealGenerationPortTable({
  model: "gpt-image-2",
  result: "image",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: {
        kind: "enum",
        values: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5",
          "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"],
      },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["1K", "2K", "4K"] }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 16 },
  ],
  requires: [],
});

export function sealGptImage2Request(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(gptImage2Ports, ports);
}

/** Scalar request seed; reference images are attached later by explicit graph edges. */
export function sealGptImage2Draft(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(gptImage2Ports, ports);
}

const gptImageBaseDefinition = defineExactModelModule({
  module: gptImageModuleRef,
  endpoints: [{
    key: "image",
    requestTypeName: "GptImage2Request",
    producerName: "request-gpt-image-2",
    ports: gptImage2Ports,
  }],
});

export const gptImageEndpoints = gptImageBaseDefinition.endpoints;
export const gptImageComponent = gptImageBaseDefinition.component;
export const gptImageSurfaceImplementationDigests = {
  image: digestOf("@narratage/gpt-image/image-surface@1"),
  cleanImage: digestOf("@narratage/gpt-image/clean/image-surface@1"),
} as const;
const gptImageSurfaceDeclaration = {
  name: "image",
  tag: "Image",
  mode: "structured" as const,
  outputs: [gptImageEndpoints.image!.draftType, gptImageEndpoints.image!.mediaBindings.images!.type],
  implementation: {
    digest: gptImageSurfaceImplementationDigests.image,
  },
};

export const gptImageMarkupSurfaces = [gptImageSurfaceDeclaration] as const;

export const gptImageManifest = {
  ...gptImageBaseDefinition.manifest,
};
export const gptImageManifestDigest = digestOf(gptImageManifest);
export const gptImageDefinition = {
  ...gptImageBaseDefinition,
  manifest: gptImageManifest,
  manifestDigest: gptImageManifestDigest,
};

/** Optional authoring submodule; the exact GPT model remains independent of post-processing. */
export const gptImageCleanModuleRef = { name: "@narratage/gpt-image/clean", version: "1" } as const;

export const gptImageCleanMarkupSurfaces = [{
    name: "image",
    tag: "Image",
    mode: "structured" as const,
    outputs: [
      gptImageEndpoints.image!.draftType,
      gptImageEndpoints.image!.mediaBindings.images!.type,
      imageTransformTypes.program,
    ],
    implementation: {
      digest: gptImageSurfaceImplementationDigests.cleanImage,
    },
  }] as const;

export const gptImageCleanManifest = {
  format: "svml.module@1" as const,
  name: gptImageCleanModuleRef.name,
  version: gptImageCleanModuleRef.version,
  dependencies: [
    { module: gptImageModuleRef, digest: gptImageManifestDigest },
    { module: imageTransformModuleRef, digest: imageTransformManifestDigest },
  ],
  types: [],
  capabilities: [],
  producers: [],
};
export const gptImageCleanManifestDigest = digestOf(gptImageCleanManifest);
export { createGptImageCleanFragment } from "./fragment.js";
