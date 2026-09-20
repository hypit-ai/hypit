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
import { beatApiMappings } from "./mapping.js";

export type BeatApiPreparedRequest = {
  readonly model: string;
  readonly media: "image" | "video";
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type BeatApiRoute = GenerationWireMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => BeatApiPreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}
function count(request: GenerationRequest, port: string): number {
  return request.ports[port]?.length ?? 0;
}

/** Ratios the Nano Banana 2 model package offers that BeatAPI's schema for it does not list. */
const NANO_BANANA_2_UNAVAILABLE: readonly string[] = ["1:4", "4:1", "1:8", "8:1"];

/** BeatAPI's documented input ranges per model, checked before any reference is uploaded. */
function rejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  const { name } = mapping.capability;
  const model = selectWireModelForRequest(mapping, request);
  const ratio = scalar(request, "aspectRatio");
  const resolution = scalar(request, "resolution");
  if (mapping.capability.module.name === "@hypit/seedance") {
    if (scalar(request, "webSearch") === true) return `BeatAPI ${model} has no web_search field`;
    if (name === "seedance-2-mini" && scalar(request, "generateAudio") === true) {
      return "BeatAPI seedance-2-mini renders no generated audio";
    }
    if (name === "seedance-2" && resolution === "1080p" && count(request, "referenceImage") > 0) {
      return "BeatAPI seedance-2 does not render 1080p with reference images";
    }
    if (name === "seedance-2.5" && scalar(request, "duration") === -1) {
      return "BeatAPI seedance-2.5 takes a duration of 4 to 30 seconds, not automatic";
    }
  }
  if (name === "minimax-h3" && count(request, "lastFrame") > 0 && count(request, "firstFrame") === 0) {
    return "BeatAPI minimax-h3 orders its images first then last, so a last frame needs a first frame";
  }
  if (name === "grok-imagine-video-1.5-preview" && resolution === "1080p" && count(request, "images") > 1) {
    return "BeatAPI grok-imagine-video-1.5 accepts at most one image at 1080p";
  }
  if (name === "gpt-image-2" && scalar(request, "background") !== undefined) {
    return "BeatAPI gpt-image-2 has no background field";
  }
  if (name === "nano-banana-2") {
    if (count(request, "images") > 10) return "BeatAPI nano-banana-2 accepts up to ten reference images";
    if (NANO_BANANA_2_UNAVAILABLE.includes(String(ratio))) {
      return `BeatAPI nano-banana-2 does not render ${String(ratio)}`;
    }
  }
  return undefined;
}

/** Fields the model package states that BeatAPI names differently, spells differently or omits. */
function normalize(mapping: GenerationWireMapping, input: Record<string, unknown>): Record<string, unknown> {
  const { name } = mapping.capability;
  // BeatAPI carries the opening and closing frames as one ordered array.
  const frames = [input.first_frame, input.last_frame].filter((item): item is string => typeof item === "string");
  delete input.first_frame;
  delete input.last_frame;
  if (frames.length > 0) input.images = frames;
  if (input.web_search === false) delete input.web_search;
  if (name === "seedance-2-mini" && input.generate_audio === false) delete input.generate_audio;
  if (name === "nano-banana-2" && input.output_format === "jpg") input.output_format = "jpeg";
  return input;
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

export const beatApiRoutes: readonly BeatApiRoute[] = beatApiMappings.map((mapping) => ({
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
      media: mapping.result === "image" ? "image" : "video",
      compile: async (resolve) => ({
        model,
        ...normalize(mapping, (await compileWireRequest(mapping, request, resolve)).input as Record<string, unknown>),
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

const byCapability = new Map(beatApiRoutes.map((route) => [route.key, route]));

export function beatApiRouteForCapability(capability: CapabilityRef): BeatApiRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
