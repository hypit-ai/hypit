import {
  compileWireRequest,
  generationTypes,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationArtifactUrlResolver, GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef, CanonicalValue, StoredValue, TypeRef } from "@hypit/protocol";
import { hypiHubMappings } from "./mapping.js";

export type HypiHubRoute = (typeof hypiHubMappings)[number] & {
  readonly key: string;
  readonly returns: TypeRef;
  readonly media: "image" | "video" | "audio";
  readonly compile: (constraints: CanonicalValue, resolve: GenerationArtifactUrlResolver) => Promise<{ readonly model: string; readonly input: CanonicalValue }>;
  readonly packageResult: (artifacts: readonly BlobRef[]) => StoredValue;
};

export const hypiHubRoutes: readonly HypiHubRoute[] = hypiHubMappings.map((mapping) => ({
  ...mapping,
  key: capabilityKey(mapping.capability),
  returns: mapping.result === "image" ? generationTypes.imageSet
    : mapping.result === "video" ? generationTypes.videoSet : generationTypes.audioSet,
  media: mapping.result,
  compile: async (constraints, resolve) => normalizeHypiHubRequest(
    mapping,
    await compileWireRequest(mapping, constraints as unknown as GenerationRequest, resolve),
  ),
  packageResult: (artifacts) => ({
    kind: "inline",
    value: canonicalize(mapping.result === "image"
      ? sealGeneratedImageSet({ images: artifacts })
      : mapping.result === "video"
        ? sealGeneratedVideoSet({ videos: artifacts })
        : sealGeneratedAudioSet({ audios: artifacts })),
  }),
}));

/** Convert the provider-neutral generation wire shape to HypiHub's public API shape. */
function normalizeHypiHubRequest(
  mapping: GenerationWireMapping,
  request: { readonly model: string; readonly input: CanonicalValue },
): { readonly model: string; readonly input: CanonicalValue } {
  const input = { ...(request.input as Record<string, unknown>) };
  if (mapping.result === "image") {
    const resolution = input.size;
    if (resolution === "1K") input.size = "1024x1024";
    else if (resolution === "2K") input.size = "2048x2048";
    else if (resolution === "4K") input.size = "3840x2160";
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
  if (Array.isArray(imageRefs) && imageRefs.length > 0) input.reference_image_urls = imageRefs;
  if (Array.isArray(genericImageRefs) && genericImageRefs.length > 0) {
    const urls = genericImageRefs.map((item) => item !== null && typeof item === "object"
      ? (item as Record<string, unknown>).url : item).filter((item): item is string => typeof item === "string" && item.length > 0);
    if (urls.length > 0) input.reference_image_urls = urls;
  }
  if (Array.isArray(videoRefs) && videoRefs.length === 1) input.ref_video_url = videoRefs[0];
  else if (Array.isArray(videoRefs) && videoRefs.length > 1) input.reference_videos = videoRefs;
  if (Array.isArray(audioRefs) && audioRefs.length > 0) input.reference_audios = audioRefs;
  return { model: request.model, input: canonicalize(input) };
}

function capabilityKey(capability: { module: { name: string; version: string }; name: string }): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

const byCapability = new Map(hypiHubRoutes.map((route) => [capabilityKey(route.capability), route]));

export function hypiHubRouteForCapability(capability: CapabilityRef): HypiHubRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
