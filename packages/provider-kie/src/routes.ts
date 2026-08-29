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
  readonly compile: (
    constraints: CanonicalValue,
    resolve: GenerationArtifactUrlResolver,
  ) => Promise<KieTaskRequest>;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

export function supportsKieGptImageRequest(request: GenerationRequest): boolean {
  if (request.ports.aspectRatio === undefined) return true;
  const ratio = request.ports.aspectRatio[0];
  // KIE's GPT Image 2 endpoints reject these ratios even though the model
  // vocabulary advertises them. Refuse before upload or paid submission.
  if (ratio === "4:3" || ratio === "3:4" || ratio === "4:5") {
    return false;
  }
  return true;
}

function validateKieGptImageRequest(request: GenerationRequest): void {
  if (!supportsKieGptImageRequest(request)) {
    const ratio = request.ports.aspectRatio?.[0];
    throw new Error(`KIE GPT Image 2 does not accept aspect ratio ${String(ratio)}; use auto, 1:1, 3:2, 2:3, 16:9, 9:16 or 21:9`);
  }
}

const kieGenerationMappings = kieModelCatalog.map((mapping) => {
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
  compile: async (constraints, resolve) => {
    const request = constraints as unknown as GenerationRequest;
    if (mapping.capability.module.name === "@hypit/gpt-image") validateKieGptImageRequest(request);
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
