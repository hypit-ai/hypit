import {
  compileWireRequest,
  generationTypes,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
  selectWireModelForRequest,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef, StoredValue, TypeRef } from "@hypit/hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/hypit/endpoint";
import { sumeMappings } from "./mapping.js";

export type SumePreparedRequest = {
  readonly model: string;
  readonly media: "image" | "video";
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<Record<string, unknown>>;
};

export type SumeRoute = GenerationWireMapping & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly supports: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => SumePreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}
function count(request: GenerationRequest, port: string): number {
  return request.ports[port]?.length ?? 0;
}

/** Ratios the model packages offer that the Sume catalog row for the model does not list. */
const UNLISTED_RATIOS: Readonly<Record<string, readonly string[]>> = {
  "grok-imagine-video-1.5-preview": ["2:3", "3:2"],
  "pixverse-v6": ["2:3", "3:2", "auto"],
  "pixverse-c1": ["2:3", "3:2"],
  "gpt-image-2": ["3:2", "2:3", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"],
  "seedream-5-lite": ["21:9"],
};

/** Sume's per-model input ranges, checked before any reference is uploaded. */
function rejection(mapping: GenerationWireMapping, request: GenerationRequest): string | undefined {
  const { name } = mapping.capability;
  const model = selectWireModelForRequest(mapping, request);
  const ratio = scalar(request, "aspectRatio");
  if (ratio !== undefined && UNLISTED_RATIOS[name]?.includes(String(ratio)) === true) {
    return `Sume ${model} does not render aspect ratio ${String(ratio)}`;
  }
  if (mapping.capability.module.name === "@hypit/seedance") {
    if (scalar(request, "webSearch") === true) return `Sume ${model} has no web_search field`;
    if (name === "seedance-2.5" && scalar(request, "duration") === -1) {
      return "Sume seedance-2.5 takes a duration of 4 to 30 seconds, not automatic";
    }
  }
  if (name === "minimax-h3" && scalar(request, "duration") === 4) {
    return "Sume minimax-h3 takes a duration of 5 to 15 seconds";
  }
  if (name === "grok-imagine-video-1.5-preview") {
    if (count(request, "images") > 1) return "Sume grok-imagine-video-1.5 takes a prompt alone or one first-frame image";
    if (ratio === "auto" && count(request, "images") === 0) {
      return "Sume grok-imagine-video-1.5 needs an explicit aspect ratio without a first frame";
    }
  }
  if (name === "pixverse-v6" || name === "pixverse-c1") {
    if (count(request, "firstFrame") > 0 || count(request, "lastFrame") > 0) {
      return `Sume ${model} takes a prompt or reference images, not frames`;
    }
    if (count(request, "referenceVideo") > 0) return `Sume ${model} takes no reference videos`;
    if (scalar(request, "multiClip") === true) return `Sume ${model} has no multi-clip field`;
    if (scalar(request, "seed") !== undefined) return `Sume ${model} takes no seed`;
    if (scalar(request, "duration") === 1) return `Sume ${model} takes a duration of 2 to 15 seconds`;
  }
  if (name === "gpt-image-2") {
    if (scalar(request, "background") !== undefined) return "Sume openai/gpt-image-2 has no background field";
    if (count(request, "images") > 10) return "Sume openai/gpt-image-2 accepts up to ten reference images";
  }
  if (name === "nano-banana-2" && count(request, "images") > 10) {
    return "Sume google/nano-banana-2.1 accepts up to ten reference images";
  }
  if (name === "seedream-5-lite") {
    if (scalar(request, "quality") !== "basic") {
      return "Sume bytedance-seed/seedream-5-lite renders at 2K only, which is quality basic";
    }
    if (scalar(request, "nsfwCheck") === false) {
      return "Sume bytedance-seed/seedream-5-lite has no switch to turn its content check off";
    }
    if (count(request, "images") > 10) return "Sume bytedance-seed/seedream-5-lite accepts up to ten reference images";
  }
  return undefined;
}

/** Fields the model package states that Sume names differently, spells differently or omits. */
function normalize(mapping: GenerationWireMapping, input: Record<string, unknown>): Record<string, unknown> {
  const { name } = mapping.capability;
  if (input.web_search === false) delete input.web_search;
  // MiniMax spells its native tier 768P; Sume's catalog lists 768p.
  if (name === "minimax-h3" && input.resolution === "768P") input.resolution = "768p";
  if (name === "grok-imagine-video-1.5-preview") {
    const images = input.images as readonly string[] | undefined;
    delete input.images;
    // A first frame keeps its own shape, and Sume applies aspect_ratio to text-to-video only.
    if (images !== undefined && images.length > 0) {
      input.image_url = images[0];
      delete input.aspect_ratio;
    }
  }
  if (name === "pixverse-v6" && input.multi_clip === false) delete input.multi_clip;
  if (mapping.result === "image") {
    const images = input.images as readonly string[] | undefined;
    delete input.images;
    if (images !== undefined && images.length > 0) {
      input.input_references = images.map((url) => ({ type: "image_url", image_url: { url } }));
    }
  }
  if (mapping.capability.module.name === "@hypit/nano-banana" && input.output_format === "jpg") input.output_format = "jpeg";
  if (name === "seedream-5-lite") {
    delete input.quality;
    delete input.nsfw_check;
  }
  return input;
}

function capabilityKey(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

export const sumeRoutes: readonly SumeRoute[] = sumeMappings.map((mapping) => ({
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
        mode: "async",
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

const byCapability = new Map(sumeRoutes.map((route) => [route.key, route]));

export function sumeRouteForCapability(capability: CapabilityRef): SumeRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
