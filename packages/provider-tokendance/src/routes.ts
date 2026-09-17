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
import { tokenDanceMappings } from "./mapping.js";

/** Which TokenDance protocol a capability submits through. */
export type TokenDanceProtocol = "ark-video" | "ark-image" | "minimax-video";

export type TokenDancePreparedRequest = {
  readonly model: string;
  readonly protocol: TokenDanceProtocol;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type TokenDanceRoute = GenerationWireMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly protocol: TokenDanceProtocol;
  /** Media the protocol documents as acceptable inline; other references need a public URL. */
  readonly inlineMedia: (mediaType: string) => boolean;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => TokenDancePreparedRequest;
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

/** Seedream 5.0 lite pixel sizes for each resolution tier and aspect ratio, from the Ark image API reference. */
const SEEDREAM_SIZES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  basic: { "1:1": "2048x2048", "4:3": "2304x1728", "3:4": "1728x2304", "16:9": "2848x1600", "9:16": "1600x2848", "3:2": "2496x1664", "2:3": "1664x2496", "21:9": "3136x1344" },
  high: { "1:1": "3072x3072", "4:3": "3456x2592", "3:4": "2592x3456", "16:9": "4096x2304", "9:16": "2304x4096", "3:2": "3744x2496", "2:3": "2496x3744", "21:9": "4704x2016" },
  ultra: { "1:1": "4096x4096", "4:3": "4704x3520", "3:4": "3520x4704", "16:9": "5504x3040", "9:16": "3040x5504", "3:2": "4992x3328", "2:3": "3328x4992", "21:9": "6240x2656" },
};

function rejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  const ratio = scalar(request, "aspectRatio");
  if (mapping.capability.module.name === "@hypit/seedance") {
    if (mapping.capability.name === "seedance-2.5" && present(request, "firstFrame") && ratio !== "adaptive") {
      return `Seedance 2.5 frame mode on TokenDance takes only aspect-ratio adaptive, not ${String(ratio)}`;
    }
    return undefined;
  }
  if (mapping.capability.module.name === "@hypit/seedream") {
    const quality = String(scalar(request, "quality"));
    if (SEEDREAM_SIZES[quality]?.[String(ratio)] === undefined) {
      return `TokenDance Seedream 5.0 lite has no size for quality ${quality} at ${String(ratio)}`;
    }
    return undefined;
  }
  if (mapping.capability.module.name === "@hypit/minimax-h3") {
    const hasMedia = ["referenceImage", "referenceVideo", "referenceAudio", "firstFrame", "lastFrame"]
      .some((port) => present(request, port));
    if (!hasMedia && (ratio === undefined || ratio === "adaptive")) {
      return "MiniMax H3 text-to-video on TokenDance requires an explicit aspect-ratio";
    }
  }
  return undefined;
}

function contentItem(type: "image_url" | "video_url" | "audio_url", url: string, role: string) {
  return { type, [type]: { url }, role };
}

/** Ark and MiniMax both take one `content` array of typed, role-tagged items. */
function contentArray(input: Record<string, unknown>) {
  const first = input.first_frame;
  const last = input.last_frame;
  return [
    { type: "text", text: input.text },
    ...(typeof first === "string" ? [contentItem("image_url", first, "first_frame")] : []),
    ...(typeof last === "string" ? [contentItem("image_url", last, "last_frame")] : []),
    ...strings(input.reference_image).map((url) => contentItem("image_url", url, "reference_image")),
    ...strings(input.reference_video).map((url) => contentItem("video_url", url, "reference_video")),
    ...strings(input.reference_audio).map((url) => contentItem("audio_url", url, "reference_audio")),
  ];
}

function arkVideoBody(model: string, input: Record<string, unknown>): Record<string, unknown> {
  return {
    model,
    content: contentArray(input),
    resolution: input.resolution,
    ratio: input.ratio,
    duration: input.duration,
    generate_audio: input.generate_audio,
    ...(input.web_search === true ? { tools: [{ type: "web_search" }] } : {}),
  };
}

function arkImageBody(model: string, input: Record<string, unknown>): Record<string, unknown> {
  const images = strings(input.image);
  return {
    model,
    prompt: input.prompt,
    ...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { image: images } : {}),
    size: SEEDREAM_SIZES[String(input.quality)]![String(input.aspect_ratio)]!,
    output_format: input.output_format,
    response_format: "url",
    watermark: false,
  };
}

function minimaxVideoBody(model: string, input: Record<string, unknown>): Record<string, unknown> {
  return {
    model,
    content: contentArray(input),
    resolution: input.resolution,
    duration: input.duration,
    ...(typeof input.ratio === "string" ? { ratio: input.ratio } : {}),
  };
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

export const tokenDanceRoutes: readonly TokenDanceRoute[] = tokenDanceMappings.map((mapping) => {
  const protocol: TokenDanceProtocol = mapping.capability.module.name === "@hypit/minimax-h3" ? "minimax-video"
    : mapping.result === "image" ? "ark-image" : "ark-video";
  const body = protocol === "ark-video" ? arkVideoBody : protocol === "ark-image" ? arkImageBody : minimaxVideoBody;
  return {
    ...mapping,
    key: capabilityKey(mapping.capability),
    returns: mapping.result === "image" ? generationTypes.imageSet : generationTypes.videoSet,
    protocol,
    // Ark documents Base64 for images and audio only; MiniMax v2 accepts data URIs for every media kind.
    inlineMedia: (mediaType) => protocol === "minimax-video" || !mediaType.startsWith("video/"),
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
        protocol,
        compile: async (resolve) => body(model, (await compileWireRequest(mapping, request, resolve)).input as Record<string, unknown>),
      };
    },
    packageResult: (artifacts) => ({
      kind: "inline",
      value: canonicalize(mapping.result === "image"
        ? sealGeneratedImageSet({ images: artifacts })
        : sealGeneratedVideoSet({ videos: artifacts })),
    }),
  };
});

const byCapability = new Map(tokenDanceRoutes.map((route) => [route.key, route]));

export function tokenDanceRouteForCapability(capability: CapabilityRef): TokenDanceRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
