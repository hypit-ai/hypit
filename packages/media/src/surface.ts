import { artifactTypes } from "@svml/artifact";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
} from "@svml/text";

const IMAGE_MEDIA_TYPES = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const AUDIO_MEDIA_TYPES = new Map([
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".oga", "audio/ogg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/opus"],
  [".wav", "audio/wav"],
]);

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function assertChildrenEmpty(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} does not accept children`);
  }
}

function mediaTypeFor(
  element: StructuredElement,
  source: string,
  kind: "image" | "audio",
  known: ReadonlyMap<string, string>,
): string {
  const explicit = element.attributes["media-type"];
  if (explicit !== undefined) {
    if (typeof explicit !== "string" || !explicit.startsWith(`${kind}/`)) {
      throw new Error(`${element.name}.media-type must be an ${kind} media type`);
    }
    return explicit;
  }
  const clean = source.split(/[?#]/u, 1)[0]!.toLocaleLowerCase("en");
  const dot = clean.lastIndexOf(".");
  const inferred = dot < 0 ? undefined : known.get(clean.slice(dot));
  if (inferred === undefined) {
    throw new Error(`${element.name}.src needs a known ${kind} extension or an explicit media-type`);
  }
  return inferred;
}

/** Host resolves and stages the bytes; this Surface only declares their authored media meaning. */
async function decodeMediaAssetSurface(
  element: StructuredElement,
  resolveAsset: Parameters<StructuredSurfaceHandler>[0]["resolveAsset"],
  kind: "image" | "audio",
  known: ReadonlyMap<string, string>,
) {
  const names = Object.keys(element.attributes).sort();
  if (names.join(",") !== "id,src" && names.join(",") !== "id,media-type,src") {
    throw new Error(`${element.name} requires id and src, with optional media-type`);
  }
  assertChildrenEmpty(element);
  const id = stringAttribute(element, "id");
  const source = stringAttribute(element, "src");
  const mediaType = mediaTypeFor(element, source, kind, known);
  const resolved = await resolveAsset({ from: source, mediaType, range: element.range });
  if (!resolved.artifact.mediaType.startsWith(`${kind}/`)) {
    throw new Error(`${element.name}.src did not resolve to an ${kind} artifact`);
  }
  return {
    records: [{
      id,
      type: artifactTypes.blob,
      value: resolved.artifact,
      range: element.range,
    }],
    components: [],
    fragments: [],
  };
}

export const decodeMediaImageSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) =>
  await decodeMediaAssetSurface(element, resolveAsset, "image", IMAGE_MEDIA_TYPES);

export const decodeMediaAudioSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) =>
  await decodeMediaAssetSurface(element, resolveAsset, "audio", AUDIO_MEDIA_TYPES);
