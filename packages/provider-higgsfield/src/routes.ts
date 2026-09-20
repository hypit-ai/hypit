import {
  compileWireRequest,
  generationTypes,
  sealGeneratedVideoSet,
  selectWireModelForRequest,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef, StoredValue, TypeRef } from "@hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/endpoint-kit";
import { higgsfieldMappings } from "./mapping.js";

export type HiggsfieldPreparedRequest = {
  /** The endpoint path under the API base, such as `bytedance/seedance-2.5/text-to-video`. */
  readonly endpoint: string;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type HiggsfieldRoute = GenerationWireMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => HiggsfieldPreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

/** Higgsfield's documented input ranges per workflow, checked before any reference is uploaded. */
function rejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  let endpoint: string;
  try {
    endpoint = selectWireModelForRequest(mapping, request);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (scalar(request, "webSearch") === true) {
    return `Higgsfield ${endpoint} has no web_search field`;
  }
  if (scalar(request, "duration") === -1) {
    return `Higgsfield ${endpoint} takes a duration in whole seconds, not automatic`;
  }
  if (mapping.capability.name === "seedance-2.5" && scalar(request, "resolution") === "1080p") {
    return `Higgsfield ${endpoint} renders 480p or 720p, not 1080p`;
  }
  const ratio = scalar(request, "aspectRatio");
  if (endpoint.endsWith("/image-to-video")) {
    if (ratio !== "adaptive") {
      return `Higgsfield ${endpoint} frames from the supplied image and has no aspect_ratio field; it takes aspect-ratio adaptive, not ${String(ratio)}`;
    }
  } else if (ratio === "adaptive") {
    return `Higgsfield ${endpoint} requires an explicit aspect ratio, not adaptive`;
  }
  return undefined;
}

/** Fields the model package states that this workflow does not declare. */
function normalize(endpoint: string, input: Record<string, unknown>): Record<string, unknown> {
  delete input.web_search;
  if (endpoint.endsWith("/image-to-video")) delete input.aspect_ratio;
  return input;
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

export const higgsfieldRoutes: readonly HiggsfieldRoute[] = higgsfieldMappings.map((mapping) => ({
  ...mapping,
  key: capabilityKey(mapping.capability),
  returns: generationTypes.videoSet,
  supports: (request) => {
    const reason = rejection(mapping, request.constraints as unknown as GenerationRequest);
    return reason === undefined ? { status: "supported" } : { status: "unsupported", reason };
  },
  prepare: (constraints) => {
    const request = constraints as unknown as GenerationRequest;
    const reason = rejection(mapping, request);
    if (reason !== undefined) throw new Error(reason);
    const endpoint = selectWireModelForRequest(mapping, request);
    return {
      endpoint,
      compile: async (resolve) =>
        normalize(endpoint, (await compileWireRequest(mapping, request, resolve)).input as Record<string, unknown>),
    };
  },
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(sealGeneratedVideoSet({ videos: artifacts })),
  }),
}));

const byCapability = new Map(higgsfieldRoutes.map((route) => [route.key, route]));

export function higgsfieldRouteForCapability(capability: CapabilityRef): HiggsfieldRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
