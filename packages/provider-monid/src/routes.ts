import {
  compileWireRequest,
  selectWireModelForRequest,
  generationTypes,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, StoredValue, TypeRef } from "@hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/endpoint-kit";
import { monidMappings } from "./mapping.js";
import type { MonidMapping } from "./mapping.js";

export type MonidPreparedRequest = {
  /** Monid provider relaying the endpoint. */
  readonly service: string;
  /** Monid endpoint path under that provider. */
  readonly endpoint: string;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type MonidRoute = MonidMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  /** What the run produces, which decides how many results collection expects. */
  readonly media: "image" | "video";
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

function referenceToVideo(request: GenerationRequest): boolean {
  return present(request, "referenceImage") || present(request, "referenceVideo") || present(request, "referenceAudio");
}

function wanRejection(mapping: MonidMapping, request: GenerationRequest): string | undefined {
  const set = scalar(request, "imageSet") === true;
  if (scalar(request, "resolution") === "4K" && (present(request, "images") || set)) {
    return "Wan renders 4K from a prompt alone, without reference images or an image set";
  }
  const count = scalar(request, "count");
  if (typeof count === "number" && count > 4 && !set) {
    return `Wan renders at most 4 pictures outside an image set, not ${count}`;
  }
  return undefined;
}

function rejection(mapping: MonidMapping, request: GenerationRequest): string | undefined {
  if (mapping.capability.module.name === "@hypit/wan") return wanRejection(mapping, request);
  if (mapping.capability.name === "minimax-h3") {
    // MiniMax-H3 resolves the framing from the uploaded image in frame mode and defaults
    // reference-to-video to adaptive. Text-to-video carries no such source, and the endpoint
    // takes no adaptive ratio there, so the aspect ratio has to be stated.
    if (!present(request, "firstFrame") && !present(request, "lastFrame") && !referenceToVideo(request)
      && scalar(request, "aspectRatio") === undefined) {
      return "MiniMax H3 text-to-video on Monid requires an aspect ratio";
    }
    return undefined;
  }
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
    ...(typeof input.model === "string" ? { model: input.model } : {}),
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

/**
 * MiniMax-H3 takes a required ratio: frame mode and reference-to-video both resolve to adaptive,
 * and rejection() has already required a stated ratio for text-to-video.
 */
function minimaxH3Input(input: Record<string, unknown>): Record<string, unknown> {
  const body = arkInput(input);
  return { ...body, ratio: body.ratio ?? "adaptive" };
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

export const monidRoutes: readonly MonidRoute[] = monidMappings.map((mapping) => ({
  ...mapping,
  key: capabilityKey(mapping.capability),
  returns: mapping.result === "image" ? generationTypes.imageSet : generationTypes.videoSet,
  media: mapping.result === "image" ? "image" as const : "video" as const,
  supports: (request) => {
    const reason = rejection(mapping, request.constraints as unknown as GenerationRequest);
    return reason === undefined ? { status: "supported" } : { status: "unsupported", reason };
  },
  prepare: (constraints) => {
    const request = constraints as unknown as GenerationRequest;
    const reason = rejection(mapping, request);
    if (reason !== undefined) throw new Error(reason);
    // The Wan endpoints take the compiled fields as their body; the ModelArk endpoints fold their
    // media into one role-tagged `content` array first.
    const body = mapping.capability.module.name === "@hypit/wan" ? (input: Record<string, unknown>) => input
      : mapping.capability.name === "minimax-h3" ? minimaxH3Input : arkInput;
    return {
      service: mapping.service,
      endpoint: selectWireModelForRequest(mapping, request),
      compile: async (resolve) => body((await compileWireRequest(mapping, request, resolve)).input as Record<string, unknown>),
    };
  },
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(mapping.result === "image"
      ? sealGeneratedImageSet({ images: artifacts })
      : sealGeneratedVideoSet({ videos: artifacts })),
  }),
}));

const byCapability = new Map(monidRoutes.map((route) => [route.key, route]));

export function monidRouteForCapability(capability: CapabilityRef): MonidRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
