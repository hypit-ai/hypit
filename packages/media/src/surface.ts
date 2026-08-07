import { artifactTypes } from "@svml/artifact";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
} from "@svml/text";

const MEDIA_TYPES = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
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

function mediaTypeFor(element: StructuredElement, source: string): string {
  const explicit = element.attributes["media-type"];
  if (explicit !== undefined) {
    if (typeof explicit !== "string" || !explicit.startsWith("image/")) {
      throw new Error(`${element.name}.media-type must be an image media type`);
    }
    return explicit;
  }
  const clean = source.split(/[?#]/u, 1)[0]!.toLocaleLowerCase("en");
  const dot = clean.lastIndexOf(".");
  const inferred = dot < 0 ? undefined : MEDIA_TYPES.get(clean.slice(dot));
  if (inferred === undefined) {
    throw new Error(`${element.name}.src needs a known image extension or an explicit media-type`);
  }
  return inferred;
}

/** Host resolves and stages the bytes; this Surface only declares their authored media meaning. */
export const decodeMediaImageSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) => {
  const names = Object.keys(element.attributes).sort();
  if (names.join(",") !== "id,src" && names.join(",") !== "id,media-type,src") {
    throw new Error(`${element.name} requires id and src, with optional media-type`);
  }
  assertChildrenEmpty(element);
  const id = stringAttribute(element, "id");
  const source = stringAttribute(element, "src");
  const mediaType = mediaTypeFor(element, source);
  const resolved = await resolveAsset({ from: source, mediaType, range: element.range });
  if (!resolved.artifact.mediaType.startsWith("image/")) {
    throw new Error(`${element.name}.src did not resolve to an image artifact`);
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
};
