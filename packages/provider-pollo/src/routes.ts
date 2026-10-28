import { capabilityKey } from "@hypit/hypit/protocol";
import {
  generationTypes,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { ProviderFieldRequest } from "@hypit/generation/provider";
import { materializeWireRequest, planWireRequest, selectWireModelForRequest } from "@hypit/generation/provider";
import type { GenerationArtifactUrlResolver, GenerationWireMapping } from "@hypit/generation/provider";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, Value, TypeRef } from "@hypit/hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/hypit/endpoint";
import { polloMappings } from "./mapping.js";
import type { PolloMapping } from "./mapping.js";

export type PolloPreparedRequest = {
  /** Request path under the Pollo platform base URL. */
  readonly path: string;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type PolloRoute = PolloMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => PolloPreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => Value;
};

function scalar(request: ProviderFieldRequest, field: string): string | number | boolean | undefined {
  const value = request.fields[field]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}
function count(request: ProviderFieldRequest, field: string): number {
  return request.fields[field]?.length ?? 0;
}
function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

const GPT_IMAGE_RATIOS = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9", "auto"];

/** Pollo's documented input ranges for each mapped model, checked before any reference is resolved. */
function rejection(mapping: GenerationWireMapping, request: ProviderFieldRequest): string | undefined {
  const { name } = mapping.capability;
  const ratio = scalar(request, "aspectRatio");
  if (name === "grok-imagine-video-1.5-preview") {
    if (count(request, "images") !== 1) return "Pollo Grok Imagine 1.5 animates exactly one image";
    if (ratio !== "auto") return `Pollo Grok Imagine 1.5 takes no aspect ratio; use auto, not ${String(ratio)}`;
  }
  if (name === "gpt-image-2" && !GPT_IMAGE_RATIOS.includes(String(ratio))) {
    return `Pollo GPT Image 2 does not render ${String(ratio)}`;
  }
  if (mapping.capability.module.name === "@hypit/nano-banana" && ratio === "auto") {
    return `Pollo ${name} takes an explicit aspect ratio, not auto`;
  }
  return undefined;
}

function ref(type: "image" | "video" | "audio") {
  return (url: string) => ({ url, type });
}

/** Fields the model package requires that Pollo names differently or does not take. */
function normalize(mapping: GenerationWireMapping, input: Record<string, unknown>): Record<string, unknown> {
  const { name } = mapping.capability;
  if (name === "minimax-h3") {
    const refs = [
      ...strings(input.refs_image).map(ref("image")),
      ...strings(input.refs_video).map(ref("video")),
      ...strings(input.refs_audio).map(ref("audio")),
    ];
    delete input.refs_image;
    delete input.refs_video;
    delete input.refs_audio;
    if (refs.length > 0) input.refs = refs;
  }
  if (name === "grok-imagine-video-1.5-preview") {
    input.image = strings(input.images)[0];
    delete input.images;
    delete input.aspect_ratio;
  }
  if (mapping.capability.module.name === "@hypit/nano-banana") delete input.output_format;
  return input;
}

export const polloRoutes: readonly PolloRoute[] = polloMappings.map((mapping) => ({
  ...mapping,
  key: capabilityKey(mapping.capability),
  returns: mapping.media === "image" ? generationTypes.imageSet : generationTypes.videoSet,
  supports: (request) => {
    const reason = rejection(mapping, request.constraints as unknown as ProviderFieldRequest);
    return reason === undefined ? { status: "supported" } : { status: "unsupported", reason };
  },
  prepare: (constraints) => {
    const request = constraints as unknown as ProviderFieldRequest;
    const reason = rejection(mapping, request);
    if (reason !== undefined) throw new Error(reason);
    return {
      path: selectWireModelForRequest(mapping, request),
      compile: async (resolve) => ({
        input: normalize(mapping, (await materializeWireRequest(planWireRequest(mapping, request), resolve)).input as Record<string, unknown>),
      }),
    };
  },
  packageResult: (artifacts) => ((canonicalize(mapping.media === "image"
      ? sealGeneratedImageSet({ images: artifacts })
      : sealGeneratedVideoSet({ videos: artifacts })))),
}));

const byCapability = new Map(polloRoutes.map((route) => [route.key, route]));

export function polloRouteForCapability(capability: CapabilityRef): PolloRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
