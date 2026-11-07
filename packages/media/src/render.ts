import { assertBlobRef } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

const FONT_MEDIA_TYPES = new Set([
  "font/otf",
  "font/ttf",
  "font/woff",
  "font/woff2",
]);

export type FontArtifactRef = {
  /** One logical face may be split into independently addressed Unicode-range sources. */
  readonly sources: readonly {
    readonly artifact: BlobRef;
    readonly unicodeRange?: string;
  }[];
  readonly weight: number;
  readonly style: "normal" | "italic" | "oblique";
};

/** Ordered exact font faces. The first face is primary; the remainder are glyph fallbacks. */
export type FontStackRef = {
  readonly faces: readonly FontArtifactRef[];
};

export function assertFontArtifactRef(value: FontArtifactRef, label = "FontArtifactRef"): void {
  if (!Array.isArray(value.sources) || value.sources.length === 0) throw new Error(`${label} sources are empty.`);
  const artifacts = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    assertBlobRef(source.artifact, `${label}.sources.${index}`);
    if (!FONT_MEDIA_TYPES.has(source.artifact.mediaType)) {
      throw new Error(`${label}.sources.${index} Artifact must use a supported font media type.`);
    }
    if (artifacts.has(source.artifact.resource)) throw new Error(`${label} repeats a source Artifact.`);
    artifacts.add(source.artifact.resource);
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
export function assertFontStackRef(value: FontStackRef, label = "FontStackRef"): void {
  if (value.faces.length === 0) throw new Error(`${label} faces are empty.`);
  const identities = new Set<string>();
  for (const [index, face] of value.faces.entries()) {
    assertFontArtifactRef(face, `${label}.faces.${index}`);
    const identity = JSON.stringify({
      sources: face.sources.map((source) => [source.artifact.resource, source.unicodeRange ?? null]),
      weight: face.weight,
      style: face.style,
    });
    if (identities.has(identity)) throw new Error(`${label} repeats an exact face.`);
    identities.add(identity);
  }
}
