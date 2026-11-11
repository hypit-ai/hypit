import {
  compileWireRequest,
  selectWireModelForRequest,
  generationTypes,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, StoredValue, TypeRef } from "@hypit/hypit/protocol";
import type { EndpointRequest, EndpointSupport } from "@hypit/hypit/endpoint";
import { hypiHubMappings } from "./mapping.js";

export type HypiHubModelOperation = "images" | "image_edits" | "videos" | "audio_speech" | "transcriptions";

/** Request identity is available before resolving any reference into a service URL. */
export type HypiHubPreparedRequest = {
  readonly model: string;
  readonly operation: HypiHubModelOperation;
  readonly compile: (resolve: GenerationArtifactUrlResolver) => Promise<{ readonly model: string; readonly input: CanonicalValue }>;
};

export type HypiHubRoute = (typeof hypiHubMappings)[number] & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly media: "image" | "video" | "audio";
  readonly supports?: (request: EndpointRequest) => EndpointSupport;
  readonly prepare: (constraints: CanonicalValue) => HypiHubPreparedRequest;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

/** Service-specific request limits, checked before resolving reference URLs. */
function hypiHubGenerationRejection(
  mapping: GenerationWireMapping,
  request: GenerationRequest,
  pendingPorts: readonly string[] = [],
): string | undefined {
  if (mapping.capability.module.name === "@hypit/bach") {
    try { selectWireModelForRequest(mapping, request, pendingPorts); }
    catch (error) { return error instanceof Error ? error.message : String(error); }
    return undefined;
  }
  if (mapping.capability.module.name !== "@hypit/gpt-image" || mapping.capability.name !== "gpt-image-2") {
    return undefined;
  }
  const ratio = scalar(request, "aspectRatio");
  const resolution = scalar(request, "resolution");
  const background = scalar(request, "background");
  const unsupportedRatios = resolution === "2K"
    ? ["5:4", "4:5", "3:1", "1:3", "9:21"]
    : resolution === "4K" ? ["3:1", "1:3", "9:21"] : [];
  if (unsupportedRatios.includes(String(ratio))) {
    return `HypiHub GPT Image 2 does not accept ${String(ratio)} at ${String(resolution)}`;
  }
  if (background !== undefined && resolution !== "1K") {
    return `HypiHub GPT Image 2 accepts the background option only at 1K; omit it at ${String(resolution)}`;
  }
  return undefined;
}

export const hypiHubRoutes: readonly HypiHubRoute[] = hypiHubMappings.map((mapping) => {
  const hasRequestLimits = mapping.capability.module.name === "@hypit/bach"
    || (mapping.capability.module.name === "@hypit/gpt-image"
      && mapping.capability.name === "gpt-image-2");
  return {
    ...mapping,
    key: capabilityKey(mapping.capability),
    returns: mapping.result === "image" ? generationTypes.imageSet
      : mapping.result === "video" ? generationTypes.videoSet : generationTypes.audioSet,
    media: mapping.result,
    ...(hasRequestLimits ? {
      supports: (request: EndpointRequest) => {
        const reason = hypiHubGenerationRejection(mapping, request.constraints as unknown as GenerationRequest,
          request.pendingInputs?.map((input) => input.input));
        return reason === undefined ? { status: "supported" } : { status: "unsupported", reason };
      },
    } : {}),
    prepare: (constraints) => {
      const request = constraints as unknown as GenerationRequest;
      const rejection = hypiHubGenerationRejection(mapping, request);
      if (rejection !== undefined) throw new Error(rejection);
      const model = selectWireModelForRequest(mapping, request);
      // Image editing is determined by authored media ports, before their URLs exist.
      const hasReferences = Object.entries(mapping.fields).some(([port, field]) =>
        (field.as === "url" || field.as === "urlArray" || field.as === "itemObject")
          && (request.ports[port]?.length ?? 0) > 0);
      const operation = mapping.result === "audio" ? "audio_speech" : mapping.result === "video" ? "videos"
        : hasReferences ? "image_edits" : "images";
      return {
        model,
        operation,
        compile: async (resolve) => normalizeHypiHubRequest(mapping, await compileWireRequest(mapping, request, resolve)),
      };
    },
    packageResult: (artifacts) => ({
      kind: "inline",
      value: canonicalize(mapping.result === "image"
        ? sealGeneratedImageSet({ images: artifacts })
        : mapping.result === "video"
          ? sealGeneratedVideoSet({ videos: artifacts })
          : sealGeneratedAudioSet({ audios: artifacts })),
    }),
  };
});

/** Convert the provider-neutral generation wire shape to HypiHub's public API shape. */
function normalizeHypiHubRequest(
  mapping: GenerationWireMapping,
  request: { readonly model: string; readonly input: CanonicalValue },
): { readonly model: string; readonly input: CanonicalValue } {
  const input = { ...(request.input as Record<string, unknown>) };
  if (mapping.result === "image") {
    return { model: request.model, input: canonicalize(input) };
  }

  // Audio mappings already use HypiHub's public /audio/speech vocabulary.
  if (mapping.result === "audio") {
    return { model: request.model, input: canonicalize(input) };
  }

  if (typeof input.resolution === "string") input.resolution = input.resolution.toLowerCase();

  const imageRefs = input.reference_image_urls;
  const genericImageRefs = input.reference_images;
  const videoRefs = input.reference_videos;
  const firstFrame = input.first_frame;
  const lastFrame = input.last_frame;
  const audioRefs = input.reference_audios;
  // References are public HypiHub media inputs, not vendor passthrough. They
  // must remain top-level so Async V2 stages the uploaded capability URLs
  // before choosing an upstream adaptor.
  delete input.reference_image_urls;
  delete input.reference_images;
  delete input.reference_videos;
  delete input.reference_audios;
  delete input.first_frame;
  delete input.last_frame;
  if (typeof firstFrame === "string" && firstFrame.length > 0) input.first_frame = firstFrame;
  if (typeof lastFrame === "string" && lastFrame.length > 0) input.last_frame = lastFrame;
  if (Array.isArray(imageRefs) && imageRefs.length > 0) input.reference_image_urls = referenceItems(imageRefs);
  if (Array.isArray(genericImageRefs) && genericImageRefs.length > 0) {
    const urls = genericImageRefs.map((item) => item !== null && typeof item === "object"
      ? (item as Record<string, unknown>).url : item).filter((item): item is string => typeof item === "string" && item.length > 0);
    if (urls.length > 0) input.reference_image_urls = urls;
  }
  if (Array.isArray(videoRefs) && videoRefs.length > 0) input.reference_videos = referenceItems(videoRefs);
  if (Array.isArray(audioRefs) && audioRefs.length > 0) input.reference_audios = referenceItems(audioRefs);
  return { model: request.model, input: canonicalize(input) };
}

/** A reference with an offset is sent as `{ url, start_time }`; one with only a URL is sent as that URL. */
function referenceItems(items: readonly unknown[]): readonly unknown[] {
  return items.map((item) => {
    if (item === null || typeof item !== "object") return item;
    const object = item as Record<string, unknown>;
    return Object.keys(object).length === 1 && typeof object.url === "string" ? object.url : object;
  });
}

function capabilityKey(capability: { module: { name: string; version: string }; name: string }): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

const byCapability = new Map(hypiHubRoutes.map((route) => [capabilityKey(route.capability), route]));

export function hypiHubRouteForCapability(capability: CapabilityRef): HypiHubRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
