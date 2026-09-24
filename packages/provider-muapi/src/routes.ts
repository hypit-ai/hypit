import {
  compileWireRequest,
  generationTypes,
  sealGeneratedVideoSet,
  selectWireModelForRequest,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, StoredValue, TypeRef } from "@hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/endpoint-kit";

import { muApiMappings } from "./mapping.js";

const MB = 1_000_000;

export type MuApiMediaLimits = {
  readonly image?: number;
  readonly video?: number;
  readonly audio?: number;
};

export type MuApiPreparedRequest = {
  readonly model: string;
  readonly mediaLimits: MuApiMediaLimits;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type MuApiRoute = GenerationWireMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => MuApiPreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function count(request: GenerationRequest, port: string): number {
  return request.ports[port]?.length ?? 0;
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

/**
 * MuAPI's initial provider surface is intentionally limited to the documented
 * text and single-image Seedance 2.5 endpoints. Unsupported generation ports
 * are rejected before reference upload and before a remote job is submitted.
 */
function rejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  let model: string;
  try {
    model = selectWireModelForRequest(mapping, request);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (count(request, "lastFrame") > 0) return `MuAPI ${model} does not expose a last-frame field in this Provider surface`;
  if (count(request, "referenceImage") > 0) return `MuAPI ${model} does not expose omni references in this Provider surface`;
  if (count(request, "referenceVideo") > 0) return `MuAPI ${model} does not expose reference videos in this Provider surface`;
  if (count(request, "referenceAudio") > 0) return `MuAPI ${model} does not expose reference audio in this Provider surface`;
  if (scalar(request, "generateAudio") === true) return `MuAPI ${model} does not document generate_audio on this endpoint`;
  if (scalar(request, "webSearch") === true) return `MuAPI ${model} does not document web_search on this endpoint`;
  return undefined;
}

function normalize(input: Record<string, unknown>): Record<string, unknown> {
  // The Hypit model contract carries these booleans on every Seedance request;
  // MuAPI's documented endpoints omit them, so do not send false feature flags.
  delete input.generate_audio;
  delete input.web_search;
  // These fields are rejected above when supplied, but keeping the normalizer
  // defensive prevents an accidental future mapping from leaking them.
  delete input.last_image;
  delete input.images_list;
  delete input.video_urls;
  delete input.audio_urls;
  return input;
}

export const muApiRoutes: readonly MuApiRoute[] = muApiMappings.map((mapping) => ({
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
    const model = selectWireModelForRequest(mapping, request);
    return {
      model,
      mediaLimits: { image: 10 * MB, video: 50 * MB },
      compile: async (resolve) => normalize((await compileWireRequest(mapping, request, resolve)).input as Record<string, unknown>),
    };
  },
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(sealGeneratedVideoSet({ videos: artifacts })),
  }),
}));

const byCapability = new Map(muApiRoutes.map((route) => [route.key, route]));

export function muApiRouteForCapability(capability: CapabilityRef): MuApiRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
