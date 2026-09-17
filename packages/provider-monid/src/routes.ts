import {
  compileWireRequest,
  selectWireModelForRequest,
  generationTypes,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, StoredValue, TypeRef } from "@hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/endpoint-kit";
import { monidMappings } from "./mapping.js";

export type MonidPreparedRequest = {
  /** Monid endpoint path under the `bytedance` provider. */
  readonly endpoint: string;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type MonidRoute = GenerationWireMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => MonidPreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}
function present(request: GenerationRequest, port: string): boolean {
  return (request.ports[port]?.length ?? 0) > 0;
}
function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function rejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  if (scalar(request, "webSearch") === true) {
    return "Monid's Seedance endpoints document no web search field";
  }
  if (mapping.capability.name === "seedance-2.5" && present(request, "firstFrame") && scalar(request, "aspectRatio") !== "adaptive") {
    return `Seedance 2.5 frame mode takes only aspect-ratio adaptive, not ${String(scalar(request, "aspectRatio"))}`;
  }
  return undefined;
}

function contentItem(type: "image_url" | "video_url" | "audio_url", url: string, role: string) {
  return { type, [type]: { url }, role };
}

/** The ModelArk request body Monid relays: one `content` array of typed, role-tagged items plus the output settings. */
function arkInput(input: Record<string, unknown>): Record<string, unknown> {
  const first = input.first_frame;
  const last = input.last_frame;
  return {
    content: [
      { type: "text", text: input.text },
      ...(typeof first === "string" ? [contentItem("image_url", first, "first_frame")] : []),
      ...(typeof last === "string" ? [contentItem("image_url", last, "last_frame")] : []),
      ...strings(input.reference_image).map((url) => contentItem("image_url", url, "reference_image")),
      ...strings(input.reference_video).map((url) => contentItem("video_url", url, "reference_video")),
      ...strings(input.reference_audio).map((url) => contentItem("audio_url", url, "reference_audio")),
    ],
    resolution: input.resolution,
    ratio: input.ratio,
    duration: input.duration,
    generate_audio: input.generate_audio,
  };
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

export const monidRoutes: readonly MonidRoute[] = monidMappings.map((mapping) => ({
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
    return {
      endpoint: selectWireModelForRequest(mapping, request),
      compile: async (resolve) => arkInput((await compileWireRequest(mapping, request, resolve)).input as Record<string, unknown>),
    };
  },
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(sealGeneratedVideoSet({ videos: artifacts })),
  }),
}));

const byCapability = new Map(monidRoutes.map((route) => [route.key, route]));

export function monidRouteForCapability(capability: CapabilityRef): MonidRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
