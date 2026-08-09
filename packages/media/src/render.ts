import { isDigest } from "@narratage/protocol";
import type { BlobRef } from "@narratage/protocol";

const FONT_MEDIA_TYPES = new Set([
  "font/otf",
  "font/ttf",
  "font/woff",
  "font/woff2",
]);

const ALPHA_SURFACE_MEDIA_TYPES = new Set([
  "image/png",
  "image/webp",
  "video/webm",
]);

export type FontArtifactRef = {
  readonly contract: "svml.font-artifact@1";
  /** One logical face may be split into independently addressed Unicode-range sources. */
  readonly sources: readonly {
    readonly artifact: BlobRef;
    readonly unicodeRange?: string;
  }[];
  readonly weight: number;
  readonly style: "normal" | "italic" | "oblique";
};

export type CompositableSurfaceRef = {
  readonly contract: "svml.compositable-surface@1";
  readonly artifact: BlobRef;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb";
  readonly alphaMode: "opaque" | "straight";
  readonly timing:
    | { readonly kind: "still" }
    | {
        readonly kind: "frames";
        readonly frameRate: {
          readonly numerator: number;
          readonly denominator: number;
        };
        readonly frameCount: number;
      };
};

function assertBlobRef(value: BlobRef, label: string): void {
  if (
    value.kind !== "blob"
    || !isDigest(value.digest)
    || !Number.isSafeInteger(value.size)
    || value.size < 0
    || !value.mediaType
  ) {
    throw new Error(`${label} Artifact is invalid.`);
  }
}

export function assertFontArtifactRef(value: FontArtifactRef, label = "FontArtifactRef"): void {
  if (value.contract !== "svml.font-artifact@1") throw new Error(`${label} contract is unsupported.`);
  if (!Array.isArray(value.sources) || value.sources.length === 0) throw new Error(`${label} sources are empty.`);
  const artifacts = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    assertBlobRef(source.artifact, `${label}.sources.${index}`);
    if (!FONT_MEDIA_TYPES.has(source.artifact.mediaType)) {
      throw new Error(`${label}.sources.${index} Artifact must use a supported font media type.`);
    }
    if (artifacts.has(source.artifact.digest)) throw new Error(`${label} repeats a source Artifact.`);
    artifacts.add(source.artifact.digest);
    if (source.unicodeRange !== undefined
      && !/^U\+[0-9a-f?]{1,6}(?:-[0-9a-f]{1,6})?(?:,U\+[0-9a-f?]{1,6}(?:-[0-9a-f]{1,6})?)*$/iu.test(source.unicodeRange)) {
      throw new Error(`${label}.sources.${index} Unicode range is invalid.`);
    }
  }
  if (!Number.isSafeInteger(value.weight) || value.weight < 1 || value.weight > 1_000) {
    throw new Error(`${label} weight is invalid.`);
  }
  if (!["normal", "italic", "oblique"].includes(value.style)) {
    throw new Error(`${label} style is invalid.`);
  }
}

export function assertCompositableSurfaceRef(
  value: CompositableSurfaceRef,
  label = "CompositableSurfaceRef",
): void {
  if (value.contract !== "svml.compositable-surface@1") throw new Error(`${label} contract is unsupported.`);
  assertBlobRef(value.artifact, label);
  if (
    !Number.isSafeInteger(value.width)
    || value.width <= 0
    || !Number.isSafeInteger(value.height)
    || value.height <= 0
  ) {
    throw new Error(`${label} dimensions are invalid.`);
  }
  if (value.colorSpace !== "srgb") throw new Error(`${label} colorSpace is unsupported.`);
  if (value.alphaMode !== "opaque" && value.alphaMode !== "straight") {
    throw new Error(`${label} alphaMode is unsupported.`);
  }
  if (value.alphaMode === "straight" && !ALPHA_SURFACE_MEDIA_TYPES.has(value.artifact.mediaType)) {
    throw new Error(`${label} straight alpha requires PNG, WebP or WebM media.`);
  }
  if (value.timing.kind === "still") {
    if (!value.artifact.mediaType.startsWith("image/")) {
      throw new Error(`${label} still timing requires an image Artifact.`);
    }
    return;
  }
  if (value.timing.kind !== "frames") throw new Error(`${label} timing is unsupported.`);
  if (!value.artifact.mediaType.startsWith("video/")) {
    throw new Error(`${label} frame timing requires a video Artifact.`);
  }
  if (
    !Number.isSafeInteger(value.timing.frameRate.numerator)
    || value.timing.frameRate.numerator <= 0
    || !Number.isSafeInteger(value.timing.frameRate.denominator)
    || value.timing.frameRate.denominator <= 0
    || !Number.isSafeInteger(value.timing.frameCount)
    || value.timing.frameCount <= 0
  ) {
    throw new Error(`${label} frame timing is invalid.`);
  }
}
