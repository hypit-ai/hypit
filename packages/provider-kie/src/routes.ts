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
import type { GenerationArtifactUrlResolver, GenerationRequest } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef, Need, StoredValue, TypeRef } from "@hypit/protocol";

import { kieModelCatalog, verifyKieModelCatalog } from "./mapping.js";
import type { KieGenerationWireMapping } from "./mapping.js";

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
  readonly supports?: (need: Need) => boolean;
  readonly compile: (
    constraints: CanonicalValue,
    resolve: GenerationArtifactUrlResolver,
  ) => Promise<KieTaskRequest>;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

function supportsKieGenerationRequest(
  mapping: KieGenerationWireMapping,
  request: GenerationRequest,
): boolean {
  for (const [port, unsupported] of Object.entries(mapping.unsupportedPortValues ?? {})) {
    const values = request.ports[port] ?? [];
    if (values.some((value) => (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      && unsupported.includes(value))) return false;
  }
  return true;
}

function validateKieGenerationRequest(
  mapping: KieGenerationWireMapping,
  request: GenerationRequest,
): void {
  for (const [port, unsupported] of Object.entries(mapping.unsupportedPortValues ?? {})) {
    const value = request.ports[port]?.find((item) =>
      (typeof item === "string" || typeof item === "number" || typeof item === "boolean")
      && unsupported.includes(item));
    if (value !== undefined) {
      throw new Error(`KIE ${mapping.capability.name} does not accept ${port} ${String(value)}`);
    }
  }
}

const kieGenerationMappings: readonly (KieGenerationWireMapping & { readonly result: "image" | "video" })[] = kieModelCatalog.map((mapping) => {
  if (mapping.result === "audio") {
    throw new Error(`KIE route ${mapping.capability.name} declares unsupported audio output`);
  }
  return mapping as KieGenerationWireMapping & { readonly result: "image" | "video" };
});

const generationRoutes: readonly KieRoute[] = kieGenerationMappings.map((mapping) => ({
  key: capabilityKey(mapping.capability),
  capability: mapping.capability,
  returns: mapping.result === "image" ? generationTypes.imageSet : generationTypes.videoSet,
  media: mapping.result,
  maxResults: mapping.result === "image" ? 16 : 8,
  ...(mapping.unsupportedPortValues === undefined ? {} : {
    supports: (need: Need) => supportsKieGenerationRequest(
      mapping,
      need.constraints as unknown as GenerationRequest,
    ),
  }),
  compile: async (constraints, resolve) => {
    const request = constraints as unknown as GenerationRequest;
    validateKieGenerationRequest(mapping, request);
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
