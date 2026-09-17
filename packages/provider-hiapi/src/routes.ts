import {
  compileWireRequest,
  selectWireModelForRequest,
  generationTypes,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, StoredValue, TypeRef } from "@hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/endpoint-kit";
import { hiApiMappings } from "./mapping.js";

export type HiApiPreparedRequest = {
  readonly model: string;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type HiApiRoute = GenerationWireMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => HiApiPreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}
function count(request: GenerationRequest, port: string): number {
  return request.ports[port]?.length ?? 0;
}

const SEEDREAM_RESOLUTION: Readonly<Record<string, string>> = { basic: "2K", ultra: "4K" };
const GPT_IMAGE_UNAVAILABLE: Readonly<Record<string, readonly string[]>> = {
  "2K": ["5:4", "4:5", "3:1", "1:3", "9:21"],
  "4K": ["1:1", "3:1", "1:3", "9:21"],
};

/** HiAPI's documented input ranges for each mapped model, checked before any reference is resolved. */
function rejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  const { name } = mapping.capability;
  const ratio = scalar(request, "aspectRatio");
  const resolution = scalar(request, "resolution");
  let model: string;
  try { model = selectWireModelForRequest(mapping, request); } catch (error) { return error instanceof Error ? error.message : String(error); }
  if (name === "seedance-2-mini" && scalar(request, "webSearch") === true) {
    return "HiAPI seedance-2.0-mini has no web_search field";
  }
  if (name === "seedance-2.5") {
    if (model === "seedance-2.5/image-to-video" && ratio !== "adaptive") {
      return `HiAPI ${model} takes only aspect-ratio adaptive, not ${String(ratio)}`;
    }
    if (model !== "seedance-2.5/reference-to-video" && resolution === "480p") {
      return `HiAPI ${model} renders 720p or 1080p, not 480p`;
    }
  }
  if (name === "seedream-5-lite" && SEEDREAM_RESOLUTION[String(scalar(request, "quality"))] === undefined) {
    return `HiAPI Seedream 5.0 lite renders 2K (basic) or 4K (ultra), not quality ${String(scalar(request, "quality"))}`;
  }
  if (name === "minimax-h3") {
    if (resolution !== undefined && resolution !== "2K") return `HiAPI minimax-h3 renders 2K only, not ${String(resolution)}`;
    if (count(request, "referenceImage") > 5) return "HiAPI minimax-h3 accepts up to five reference images";
  }
  if (name === "gpt-image-2") {
    if (count(request, "images") > 6) return "HiAPI gpt-image-2/image-to-image accepts up to six reference images";
    if (scalar(request, "background") !== undefined && resolution !== "1K") return `HiAPI GPT Image 2 accepts background only at 1K; omit it at ${String(resolution)}`;
    if (ratio === "auto" && resolution !== "1K") return "HiAPI GPT Image 2 renders aspect-ratio auto only at 1K";
    if (GPT_IMAGE_UNAVAILABLE[String(resolution)]?.includes(String(ratio))) return `HiAPI GPT Image 2 does not render ${String(ratio)} at ${String(resolution)}`;
  }
  if (mapping.capability.module.name === "@hypit/grok-imagine") {
    if (resolution === "1080p") return `HiAPI ${model} renders 480p or 720p, not 1080p`;
    if (name === "grok-imagine-video-1.5-preview" && count(request, "images") !== 1) {
      return "HiAPI grok-imagine-1.5/image-to-video animates exactly one image";
    }
  }
  return undefined;
}

/** Fields the model package requires that HiAPI names differently or does not take. */
function normalize(mapping: GenerationWireMapping, input: Record<string, unknown>): Record<string, unknown> {
  const { name } = mapping.capability;
  if (name === "seedance-2-mini" && input.web_search === false) delete input.web_search;
  if (name === "seedream-5-lite") {
    input.resolution = SEEDREAM_RESOLUTION[String(input.quality)];
    delete input.quality;
    delete input.output_format;
    delete input.nsfw_check;
  }
  return input;
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

export const hiApiRoutes: readonly HiApiRoute[] = hiApiMappings.map((mapping) => ({
  ...mapping,
  key: capabilityKey(mapping.capability),
  returns: mapping.result === "image" ? generationTypes.imageSet : generationTypes.videoSet,
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
      compile: async (resolve) => ({
        model,
        input: normalize(mapping, (await compileWireRequest(mapping, request, resolve)).input as Record<string, unknown>),
      }),
    };
  },
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(mapping.result === "image"
      ? sealGeneratedImageSet({ images: artifacts })
      : sealGeneratedVideoSet({ videos: artifacts })),
  }),
}));

const byCapability = new Map(hiApiRoutes.map((route) => [route.key, route]));

export function hiApiRouteForCapability(capability: CapabilityRef): HiApiRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
