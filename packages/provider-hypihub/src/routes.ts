import {
  compileWireRequest,
  generationTypes,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, StoredValue, TypeRef } from "@hypit/protocol";
import { hypiHubMappings } from "./mapping.js";

export type HypiHubRoute = (typeof hypiHubMappings)[number] & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly media: "image" | "video" | "audio";
  readonly compile: (constraints: CanonicalValue, resolve: GenerationArtifactUrlResolver) => Promise<{ readonly model: string; readonly input: CanonicalValue }>;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

export const hypiHubRoutes: readonly HypiHubRoute[] = hypiHubMappings.map((mapping) => ({
  ...mapping,
  key: capabilityKey(mapping.capability),
  returns: mapping.result === "image" ? generationTypes.imageSet
    : mapping.result === "video" ? generationTypes.videoSet : generationTypes.audioSet,
  media: mapping.result,
  compile: (constraints, resolve) => compileWireRequest(mapping, constraints as unknown as GenerationRequest, resolve),
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(mapping.result === "image"
      ? sealGeneratedImageSet({ images: artifacts })
      : mapping.result === "video"
        ? sealGeneratedVideoSet({ videos: artifacts })
        : sealGeneratedAudioSet({ audios: artifacts })),
  }),
}));

function capabilityKey(capability: { module: { name: string; version: string }; name: string }): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

const byCapability = new Map(hypiHubRoutes.map((route) => [capabilityKey(route.capability), route]));

export function hypiHubRouteForCapability(capability: CapabilityRef): HypiHubRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
