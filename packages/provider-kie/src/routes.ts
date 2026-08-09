import { artifactTypes } from "@narratage/artifact";
import {
  assertBackgroundRemovalRequest,
  backgroundRemovalCapabilities,
} from "@narratage/background-removal";
import type { BackgroundRemovalRequest } from "@narratage/background-removal";
import {
  compileWireRequest,
  generationTypes,
  mappingSupportsRequest,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@narratage/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest } from "@narratage/generation";
import { canonicalize } from "@narratage/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef, StoredValue, TypeRef } from "@narratage/protocol";

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
  readonly supports: (constraints: CanonicalValue) => boolean;
  readonly compile: (
    constraints: CanonicalValue,
    resolve: GenerationArtifactUrlResolver,
  ) => Promise<KieTaskRequest>;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

const generationRoutes: readonly KieRoute[] = kieModelCatalog.map((mapping) => ({
  key: capabilityKey(mapping.capability),
  capability: mapping.capability,
  returns: mapping.result === "image" ? generationTypes.imageSet : generationTypes.videoSet,
  media: mapping.result,
  maxResults: mapping.result === "image" ? 16 : 8,
  supports: (constraints) => mappingSupportsRequest(mapping, constraints),
  compile: async (constraints, resolve) => await compileWireRequest(
    mapping,
    constraints as unknown as GenerationRequest,
    resolve,
  ),
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(mapping.result === "image"
      ? sealGeneratedImageSet({ contract: "svml.generated-image-set@1", images: artifacts })
      : sealGeneratedVideoSet({ contract: "svml.generated-video-set@1", videos: artifacts })),
  }),
}));

const backgroundRemovalRoute: KieRoute = {
  key: capabilityKey(backgroundRemovalCapabilities.remove),
  capability: backgroundRemovalCapabilities.remove,
  returns: artifactTypes.blob,
  media: "image",
  maxResults: 1,
  supports: (constraints) => {
    try {
      assertBackgroundRemovalRequest(constraints as unknown as BackgroundRemovalRequest);
      return true;
    } catch {
      return false;
    }
  },
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
