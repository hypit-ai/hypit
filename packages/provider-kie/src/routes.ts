import { artifactTypes } from "@hypit/artifact";
import {
  assertBackgroundRemovalRequest,
  backgroundRemovalCapabilities,
} from "@hypit/background-removal";
import type { BackgroundRemovalRequest } from "@hypit/background-removal";
import {
  compileWireRequest,
  generationTypes,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef, StoredValue, TypeRef } from "@hypit/protocol";
import type { EndpointRequest } from "@hypit/endpoint-kit";

import { kieModelCatalog, verifyKieModelCatalog } from "./mapping.js";

export type KieTaskRequest = {
  readonly model: string;
  readonly input: CanonicalValue;
};

export type KieRoute = {
  readonly key: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly media: "image" | "video";
  readonly maxResults: number;
  readonly supports?: (request: EndpointRequest) => boolean;
  readonly compile: (
    constraints: CanonicalValue,
    resolve: GenerationArtifactUrlResolver,
  ) => Promise<KieTaskRequest>;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

/** Returns the KIE-wire limitation that rejects an otherwise valid model request. */
function kieGenerationRejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  if (mapping.capability.module.name === "@hypit/gpt-image" && mapping.capability.name === "gpt-image-2") {
    const ratio = scalar(request, "aspectRatio");
    const resolution = scalar(request, "resolution");
    if (ratio === "auto" && resolution !== "1K") {
      return `KIE GPT Image 2 accepts auto aspect ratio only at 1K, not ${String(resolution)}`;
    }
    if (ratio === "1:1" && resolution === "4K") {
      return "KIE GPT Image 2 does not accept 1:1 at 4K";
    }
    if (ratio === "4:5" && resolution !== "1K") {
      return `KIE GPT Image 2 accepts 4:5 only at 1K, not ${String(resolution)}`;
    }
  }
  if (mapping.capability.module.name === "@hypit/grok-imagine"
    && (mapping.capability.name === "grok-imagine-video"
      || mapping.capability.name === "grok-imagine-video-1.5-preview")
    && scalar(request, "resolution") === "1080p"
    && (request.ports.images?.length ?? 0) > 1) {
    return `KIE ${mapping.capability.name} accepts at most one reference image at 1080p`;
  }
  return undefined;
}

const kieGenerationMappings: readonly (GenerationWireMapping & { readonly result: "image" | "video" })[] = kieModelCatalog.map((mapping) => {
  if (mapping.result === "audio") {
    throw new Error(`KIE route ${mapping.capability.name} declares unsupported audio output`);
  }
  return mapping as GenerationWireMapping & { readonly result: "image" | "video" };
});

const generationRoutes: readonly KieRoute[] = kieGenerationMappings.map((mapping) => ({
  key: capabilityKey(mapping.capability),
  capability: mapping.capability,
  returns: mapping.result === "image" ? generationTypes.imageSet : generationTypes.videoSet,
  media: mapping.result,
  maxResults: mapping.result === "image" ? 16 : 8,
  supports: (need: EndpointRequest) => kieGenerationRejection(
    mapping,
    need.constraints as unknown as GenerationRequest,
  ) === undefined,
  compile: async (constraints, resolve) => {
    const request = constraints as unknown as GenerationRequest;
    const rejection = kieGenerationRejection(mapping, request);
    if (rejection !== undefined) throw new Error(rejection);
    return await compileWireRequest(mapping, request, resolve);
  },
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(mapping.result === "image"
      ? sealGeneratedImageSet({ images: artifacts })
      : sealGeneratedVideoSet({ videos: artifacts })),
  }),
}));

const backgroundRemovalRoute: KieRoute = {
  key: capabilityKey(backgroundRemovalCapabilities.remove),
  capability: backgroundRemovalCapabilities.remove,
  returns: artifactTypes.blob,
  media: "image",
  maxResults: 1,
  compile: async (constraints, resolve) => {
    const request = constraints as unknown as BackgroundRemovalRequest;
    assertBackgroundRemovalRequest(request);
    return {
      model: "recraft/remove-background",
      input: canonicalize({ image: await resolve(request.source) }),
    };
  },
  packageResult: (artifacts) => {
    if (artifacts.length !== 1 || artifacts[0] === undefined) {
      throw new Error("KIE Background Removal requires exactly one image result");
    }
    return artifacts[0];
  },
};

export const kieRoutes: readonly KieRoute[] = [...generationRoutes, backgroundRemovalRoute];
const routeByCapability = new Map(kieRoutes.map((route) => [route.key, route]));

export function kieRouteForCapability(capability: CapabilityRef): KieRoute | undefined {
  return routeByCapability.get(capabilityKey(capability));
}

export function verifyKieRoutes(): void {
  verifyKieModelCatalog();
  if (routeByCapability.size !== kieRoutes.length) throw new Error("KIE routes repeat a capability");
  kieRoutes.forEach((route) => {
    if (route.key !== capabilityKey(route.capability)) throw new Error("KIE route key differs from its capability");
    if (!Number.isSafeInteger(route.maxResults) || route.maxResults <= 0) throw new Error("KIE route result limit is invalid");
  });
}
