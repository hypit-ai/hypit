import { sealGenerationPortRequest, sealGenerationPortTable } from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { digestOf } from "@narratage/protocol";

export const minimaxH3ModuleRef = { name: "@narratage/minimax-h3", version: "1" } as const;

/**
 * What MiniMax H3 accepts is a property of the trained model, not of whichever
 * service resells it. A service that splits these ports across several of its
 * own endpoints expresses that in its wire mapping.
 *
 * `768P` and `2K` are the model's own two output tiers — H3-Base renders at
 * 768p and H3-Regenerate-2K re-renders from the original context — so the
 * spelling is MiniMax's, not any gateway's.
 */
export const minimaxH3Ports: GenerationPortTable = sealGenerationPortTable({
  contract: "svml.generation-ports@1",
  model: "minimax-h3",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 7_000 }, minItems: 1, maxItems: 1 },
    {
      name: "duration",
      value: { kind: "number", integer: true, minimum: 4, maximum: 15 },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["768P", "2K"] }, minItems: 0, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] },
      minItems: 0,
      maxItems: 1,
    },
    { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
    { name: "referenceVideo", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 3 },
    { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0, maxItems: 3 },
    { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
  ],
  requires: [
    { kind: "atMostOneOf", ports: ["referenceImage", "firstFrame"] },
    { kind: "atMostOneOf", ports: ["referenceVideo", "firstFrame"] },
    { kind: "atMostOneOf", ports: ["referenceAudio", "firstFrame"] },
    { kind: "requiresAnyOf", port: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
    // A first/last frame run inherits its framing from the uploaded image, so the
    // model takes no aspect ratio in that mode.
    { kind: "atMostOneOf", ports: ["aspectRatio", "firstFrame"] },
    { kind: "weightedTotal", weights: { referenceImage: 1, referenceVideo: 1, referenceAudio: 1 }, maximum: 12 },
  ],
});

export function sealMinimaxH3Request(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(minimaxH3Ports, ports);
}

const minimaxH3BaseDefinition = defineExactModelModule({
  module: minimaxH3ModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "MinimaxH3Request",
    producerName: "request-minimax-h3",
    ports: minimaxH3Ports,
  }],
});

export const minimaxH3Endpoints = minimaxH3BaseDefinition.endpoints;
export const minimaxH3Component = minimaxH3BaseDefinition.component;
export const minimaxH3SurfaceImplementationDigests = {
  textVideo: digestOf("@narratage/minimax-h3/text-video-surface@1"),
  frameVideo: digestOf("@narratage/minimax-h3/frame-video-surface@1"),
  referenceVideo: digestOf("@narratage/minimax-h3/reference-video-surface@1"),
} as const;
const endpoint = minimaxH3Endpoints.video!;
const declaration = (
  name: string, tag: string, digest: (typeof minimaxH3SurfaceImplementationDigests)[keyof typeof minimaxH3SurfaceImplementationDigests],
  bindings: readonly (keyof typeof endpoint.mediaBindings)[] = [],
) => ({
  name, tag, mode: "structured" as const,
  outputs: [endpoint.draftType, ...bindings.map((port) => endpoint.mediaBindings[port]!.type)],
  implementation: { kind: "trusted-frontend-surface" as const, locator: `@narratage/minimax-h3/${name}-surface`, digest },
});
export const minimaxH3Manifest = {
  ...minimaxH3BaseDefinition.manifest,
  surfaces: [
    declaration("text-video", "TextVideo", minimaxH3SurfaceImplementationDigests.textVideo),
    declaration("frame-video", "FrameVideo", minimaxH3SurfaceImplementationDigests.frameVideo, ["firstFrame", "lastFrame"]),
    declaration("reference-video", "ReferenceVideo", minimaxH3SurfaceImplementationDigests.referenceVideo, ["referenceImage", "referenceVideo", "referenceAudio"]),
  ],
};
export const minimaxH3ManifestDigest = digestOf(minimaxH3Manifest);
export const minimaxH3Definition = {
  ...minimaxH3BaseDefinition, manifest: minimaxH3Manifest, manifestDigest: minimaxH3ManifestDigest,
};
