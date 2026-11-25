import { blobTypes } from "@hypit/hypit/blob";
import type { StructuredElement, StructuredSurfaceHandler } from "@hypit/hypit/markup";
import type { FontArtifactRef } from "./render.js";
import { assertFontArtifactRef, assertFontStackRef } from "./render.js";
import { mediaTypes } from "./manifest.js";

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

const VIDEO_MEDIA_TYPES = new Map([
  [".m4v", "video/x-m4v"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

const FONT_MEDIA_TYPES = new Map([
  [".otf", "font/otf"],
  [".ttf", "font/ttf"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
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

function localName(name: string): string {
  const colon = name.lastIndexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

function assertAttributes(
  element: StructuredElement,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(element.attributes);
  if (required.some((name) => element.attributes[name] === undefined) || actual.some((name) => !allowed.has(name))) {
    const suffix = optional.length === 0 ? "" : `, with optional ${optional.join(", ")}`;
    throw new Error(`${element.name} requires ${required.join(", ")}${suffix}`);
  }
}

function mediaTypeFor(
  element: StructuredElement,
  source: string,
  kind: "image" | "audio" | "video" | "font",
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
  kind: "image" | "audio" | "video",
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
      type: blobTypes.blob,
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

export const decodeMediaVideoSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) =>
  await decodeMediaAssetSurface(element, resolveAsset, "video", VIDEO_MEDIA_TYPES);

export const decodeMediaFontSurface: StructuredSurfaceHandler = async ({ element, resolveAsset }) => {
  assertAttributes(element, ["id", "weight", "style"], ["src", "media-type"]);
  const id = stringAttribute(element, "id");
  const weight = Number(stringAttribute(element, "weight"));
  if (!Number.isSafeInteger(weight) || weight < 1 || weight > 1_000) {
    throw new Error(`${element.name}.weight must be an integer from 1 to 1000`);
  }
  const style = stringAttribute(element, "style");
  if (style !== "normal" && style !== "italic" && style !== "oblique") {
    throw new Error(`${element.name}.style must be normal, italic or oblique`);
  }
  const fontStyle = style as "normal" | "italic" | "oblique";
  const sourceAttribute = element.attributes.src;
  const sourceChildren = element.children.filter((child): child is StructuredElement => child.kind === "element");
  if (element.children.some((child) => child.kind === "text" && child.value.trim().length > 0)) {
    throw new Error(`${element.name} accepts only Source children`);
  }
  if (sourceAttribute !== undefined && sourceChildren.length > 0) {
    throw new Error(`${element.name} must use either src or Source children, not both`);
  }
  if (sourceAttribute === undefined && sourceChildren.length === 0) {
    throw new Error(`${element.name} requires src or one or more Source children`);
  }
  if (sourceAttribute === undefined && element.attributes["media-type"] !== undefined) {
    throw new Error(`${element.name}.media-type belongs on each Source when the face has multiple sources`);
  }
  const declarations = sourceAttribute === undefined
    ? sourceChildren.map((child) => {
        if (localName(child.name) !== "Source") throw new Error(`${element.name} accepts only Source children`);
        assertAttributes(child, ["src"], ["media-type", "unicode-range"]);
        assertChildrenEmpty(child);
        return {
          element: child,
          source: stringAttribute(child, "src"),
          unicodeRange: child.attributes["unicode-range"] === undefined
            ? undefined
            // Accept the list as a stylesheet writes it (`U+0000-00FF, U+0131`), as the fontsource adapter does.
            : stringAttribute(child, "unicode-range").replace(/\s+/gu, ""),
        };
      })
    : [{ element, source: stringAttribute(element, "src"), unicodeRange: undefined }];
  const sources: FontArtifactRef["sources"][number][] = [];
  for (const declaration of declarations) {
    const mediaType = mediaTypeFor(declaration.element, declaration.source, "font", FONT_MEDIA_TYPES);
    const resolved = await resolveAsset({ from: declaration.source, mediaType, range: declaration.element.range });
    sources.push({
      artifact: resolved.artifact,
      ...(declaration.unicodeRange === undefined ? {} : { unicodeRange: declaration.unicodeRange }),
    });
  }
  const font = {
    sources,
    weight,
    style: fontStyle,
  };
  assertFontArtifactRef(font, `${element.name}.${id}`);
  return {
    records: [{ id, type: mediaTypes.fontArtifact, value: { kind: "inline" as const, value: font }, range: element.range }],
    components: [],
    fragments: [],
  };
};

function sameType(left: { readonly module: { readonly name: string; readonly version: string }; readonly name: string }, right: typeof mediaTypes.fontArtifact): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

export const decodeMediaFontStackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "primary"]);
  const id = stringAttribute(element, "id");
  const faces: FontArtifactRef[] = [];
  const append = (owner: StructuredElement, name: string): void => {
    const raw = owner.attributes[name];
    if (typeof raw !== "object" || raw.kind !== "reference") {
      throw new Error(`${owner.name}.${name} must be a whole-value reference`);
    }
    const resolved = resolveReference(raw.path);
    if (resolved === undefined) throw new Error(`${owner.name}.${name} cannot resolve ${raw.path}`);
    if (!sameType(resolved.type, mediaTypes.fontArtifact)) throw new Error(`${owner.name}.${name} has the wrong type`);
    if (resolved.record?.value.kind !== "inline") {
      throw new Error(`${owner.name}.${name} must reference an authored inline FontArtifact`);
    }
    faces.push(resolved.record.value.value as unknown as FontArtifactRef);
  };
  append(element, "primary");
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Fallback children`);
      continue;
    }
    if (localName(child.name) !== "Fallback") throw new Error(`${element.name} accepts only Fallback children`);
    assertAttributes(child, ["font"]);
    assertChildrenEmpty(child);
    append(child, "font");
  }
  const stack = { faces };
  assertFontStackRef(stack, `${element.name}.${id}`);
  return {
    records: [{ id, type: mediaTypes.fontStack, value: { kind: "inline", value: stack }, range: element.range }],
    components: [],
    fragments: [],
  };
};
