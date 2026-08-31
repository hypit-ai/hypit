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
  // MiMo voice-clone is the one exception: its upstream adaptor expects the
  // sample as bare base64 in `audio.voice`, while the provider's artifact
  // resolver quite correctly returns a data URL. Strip only that transport
  // prefix here so the provider stays decoupled from the upstream wire shape.
  if (mapping.result === "audio") {
    if (mapping.capability.name === "mimo-v2.5-tts-voiceclone" && typeof input.voice === "string") {
      const match = /^data:[^;,]+(?:;[^;,]+)*;base64,(.*)$/su.exec(input.voice);
      if (match !== null) input.voice = match[1];
    }
    return { model: request.model, input: canonicalize(input) };
  }

  if (typeof input.resolution === "string") input.resolution = input.resolution.toLowerCase();

  const imageRefs = input.reference_image_urls;
  const genericImageRefs = input.reference_images;
  const videoRefs = input.reference_videos;
  const firstFrame = input.first_image_url;
  const lastFrame = input.last_image_url;
  const audioRefs = input.reference_audios;
  const sourceTaskId = input.source_task_id;
  if (typeof sourceTaskId === "string" && sourceTaskId.length > 0) {
    throw new Error("HypiHub unified video API does not support video continuation sourceTaskId");
  }

  // HypiHub's upstream relay exposes vendor-specific reference arrays through
  // its documented `extra` passthrough. Unknown top-level fields are ignored
  // by the public JSON decoder, while `extra` is handed to the selected
  // upstream adaptor and becomes its provider-neutral reference vocabulary.
  const extra = input.extra !== null && typeof input.extra === "object" && !Array.isArray(input.extra)
    ? { ...(input.extra as Record<string, unknown>) } : {};
  if (Array.isArray(imageRefs) && imageRefs.length > 0) extra.reference_image_urls = imageRefs;
  if (Array.isArray(genericImageRefs) && genericImageRefs.length > 0) {
    const urls = genericImageRefs.map((item) => item !== null && typeof item === "object"
      ? (item as Record<string, unknown>).url : item).filter((item): item is string => typeof item === "string" && item.length > 0);
    if (urls.length > 0) extra.reference_image_urls = urls;
  }
  if (Array.isArray(videoRefs) && videoRefs.length > 0) extra.reference_videos = videoRefs;
  if (Array.isArray(audioRefs) && audioRefs.length > 0) extra.reference_audios = audioRefs;
  delete input.reference_image_urls;
  delete input.reference_images;
  delete input.reference_videos;
  delete input.reference_audios;
  delete input.first_image_url;
  delete input.last_image_url;
  delete input.source_task_id;
  delete input.extra;
  if (typeof firstFrame === "string" && firstFrame.length > 0) input.input_reference = firstFrame;
  if (typeof lastFrame === "string" && lastFrame.length > 0) input.last_frame = lastFrame;
  if (Object.keys(extra).length > 0) input.extra = extra;
  return { model: request.model, input: canonicalize(input) };
}

function capabilityKey(capability: { module: { name: string; version: string }; name: string }): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

const byCapability = new Map(hypiHubRoutes.map((route) => [capabilityKey(route.capability), route]));

export function hypiHubRouteForCapability(capability: CapabilityRef): HypiHubRoute | undefined {
  return byCapability.get(capabilityKey(capability));
}
