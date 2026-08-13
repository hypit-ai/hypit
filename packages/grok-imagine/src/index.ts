import { sealGenerationPortRequest, sealGenerationPortTable } from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { digestOf } from "@narratage/protocol";

export const grokImagineModuleRef = { name: "@narratage/grok-imagine", version: "1" } as const;
export const grokImagineModels = ["grok-imagine-video", "grok-imagine-video-1.5-preview"] as const;
export type GrokImagineModel = typeof grokImagineModels[number];

export const grokImagineVideoPorts: GenerationPortTable = sealGenerationPortTable({
  contract: "svml.generation-ports@1",
  model: "grok-imagine-video",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 6, maximum: 30 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 4 },
    /** Continues an earlier generation; only meaningful beside its source images. */
    { name: "sourceTaskId", value: { kind: "token", minLength: 1, maxLength: 255 }, minItems: 0, maxItems: 1 },
  ],
  requires: [{ kind: "requiresPresent", port: "sourceTaskId", needs: ["images"] }],
});

export const grokImagine15PreviewPorts: GenerationPortTable = sealGenerationPortTable({
  contract: "svml.generation-ports@1",
  model: "grok-imagine-video-1.5-preview",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 6, maximum: 30 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 4 },
  ],
  requires: [],
});

export const grokImaginePorts: Readonly<Record<GrokImagineModel, GenerationPortTable>> = {
  "grok-imagine-video": grokImagineVideoPorts,
  "grok-imagine-video-1.5-preview": grokImagine15PreviewPorts,
};

export function sealGrokImagineRequest(
  model: GrokImagineModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(grokImaginePorts[model], ports);
}

const grokImagineBaseDefinition = defineExactModelModule({
  module: grokImagineModuleRef,
  endpoints: [
    {
      key: "video",
      requestTypeName: "GrokImagineVideoRequest",
      producerName: "request-grok-imagine-video",
      ports: grokImagineVideoPorts,
    },
    {
      key: "preview-1.5",
      requestTypeName: "GrokImagine15PreviewRequest",
      producerName: "request-grok-imagine-preview-1-5",
      ports: grokImagine15PreviewPorts,
    },
  ],
});

export const grokImagineEndpoints = grokImagineBaseDefinition.endpoints;
export const grokImagineComponent = grokImagineBaseDefinition.component;
export const grokImagineSurfaceImplementationDigests = {
  video: digestOf("@narratage/grok-imagine/video-surface@1"),
  previewVideo: digestOf("@narratage/grok-imagine/preview-video-surface@1"),
} as const;
const surface = (
  name: "video" | "preview-video",
  tag: "Video" | "PreviewVideo",
  endpoint: NonNullable<(typeof grokImagineEndpoints)["video" | "preview-1.5"]>,
  digest: (typeof grokImagineSurfaceImplementationDigests)["video" | "previewVideo"],
) => ({
  name,
  tag,
  mode: "structured" as const,
  outputs: [endpoint.draftType, endpoint.mediaBindings.images!.type],
  implementation: {
    digest,
  },
});

export const grokImagineMarkupSurfaces = [
    surface("video", "Video", grokImagineEndpoints.video!, grokImagineSurfaceImplementationDigests.video),
    surface("preview-video", "PreviewVideo", grokImagineEndpoints["preview-1.5"]!, grokImagineSurfaceImplementationDigests.previewVideo),
  ] as const;

export const grokImagineManifest = {
  ...grokImagineBaseDefinition.manifest,
};
export const grokImagineManifestDigest = digestOf(grokImagineManifest);
export const grokImagineDefinition = {
  ...grokImagineBaseDefinition,
  manifest: grokImagineManifest,
  manifestDigest: grokImagineManifestDigest,
};
