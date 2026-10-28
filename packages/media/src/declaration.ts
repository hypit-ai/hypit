import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type Awaitable,
} from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import type { CanonicalValue, TypeRef } from "@hypit/hypit/protocol";

import { mediaModuleRef, mediaTypes } from "./manifest.js";
import {
  assertFontArtifactRef,
  assertFontStackRef,
  type FontArtifactRef,
} from "./render.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

const imageMediaTypes = new Map([
  [".avif", "image/avif"], [".gif", "image/gif"], [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"],
]);
const audioMediaTypes = new Map([
  [".aac", "audio/aac"], [".flac", "audio/flac"], [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"], [".oga", "audio/ogg"], [".ogg", "audio/ogg"],
  [".opus", "audio/opus"], [".wav", "audio/wav"],
]);
const videoMediaTypes = new Map([
  [".m4v", "video/x-m4v"], [".mov", "video/quicktime"],
  [".mp4", "video/mp4"], [".webm", "video/webm"],
]);
const fontMediaTypes = new Map([
  [".otf", "font/otf"], [".ttf", "font/ttf"], [".woff", "font/woff"], [".woff2", "font/woff2"],
]);

function literal(declaration: DeclarationLike, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`Media ${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  const value = declarationField(declaration, name);
  if (value === undefined) return undefined;
  if (value.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`Media ${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

function idBinding(id: string, type: TypeRef) {
  return { name: id, ref: { kind: "record" as const, id }, type };
}

function mediaTypeFor(
  declaration: DeclarationLike,
  source: string,
  kind: "image" | "audio" | "video" | "font",
  known: ReadonlyMap<string, string>,
): string {
  const explicit = optionalLiteral(declaration, "media-type");
  if (explicit !== undefined) {
    if (!explicit.startsWith(`${kind}/`)) throw new Error(`Media media-type must be an ${kind} media type.`);
    return explicit;
  }
  const clean = source.split(/[?#]/u, 1)[0]!.toLocaleLowerCase("en");
  const dot = clean.lastIndexOf(".");
  const inferred = dot < 0 ? undefined : known.get(clean.slice(dot));
  if (inferred === undefined) throw new Error(`Media src needs a known ${kind} extension or an explicit media-type.`);
  return inferred;
}

const idField = {
  name: "id", kind: "identifier" as const, required: true,
  summary: "Names the authored value.",
};
const sourceField = {
  name: "src", kind: "literal" as const, required: true,
  summary: "Locates bytes through the compiling Host.",
};
const mediaTypeField = {
  name: "media-type", kind: "literal" as const, required: false,
  summary: "States the media type when the locator does not imply one.",
};

function assetDeclaration(
  declaration: "image" | "audio" | "video",
  kind: "image" | "audio" | "video",
  known: ReadonlyMap<string, string>,
): AuthorDeclarationCompiler {
  return {
    module: mediaModuleRef,
    declaration,
    outputs: [blobTypes.blob],
    shape: {
      summary: `Publishes one Host-resolved ${kind} Artifact.`,
      fields: [idField, sourceField, mediaTypeField],
    },
    bindings(value) {
      const id = literal(value, "id");
      return [idBinding(id, blobTypes.blob)];
    },
    async compile({ declaration: value, resolveAsset }) {
      const id = literal(value, "id");
      const source = literal(value, "src");
      const mediaType = mediaTypeFor(value, source, kind, known);
      const resolved = await resolveAsset({ from: source, mediaType, range: value.range });
      if (!resolved.mediaType.startsWith(`${kind}/`)) {
        throw new Error(`Media src did not resolve to an ${kind} artifact.`);
      }
      return {
        records: [{ id, type: blobTypes.blob, value: resolved, range: value.range }],
        components: [],
      };
    },
  };
}

export const mediaImageAuthorDeclaration = assetDeclaration("image", "image", imageMediaTypes);
export const mediaAudioAuthorDeclaration = assetDeclaration("audio", "audio", audioMediaTypes);
export const mediaVideoAuthorDeclaration = assetDeclaration("video", "video", videoMediaTypes);

const fontSourceShape = {
  name: "Source",
  cardinality: "many" as const,
  summary: "Contributes one Unicode-range file shard of the exact face.",
  fields: [
    sourceField,
    mediaTypeField,
    {
      name: "unicode-range", kind: "literal" as const, required: false,
      summary: "Limits this source to one CSS Unicode range.",
    },
  ],
};

export const mediaFontAuthorDeclaration: AuthorDeclarationCompiler = {
  module: mediaModuleRef,
  declaration: "font",
  outputs: [mediaTypes.fontArtifact],
  shape: {
    summary: "Publishes one exact font face from one file or several Unicode-range files.",
    fields: [
      idField,
      { ...sourceField, required: false },
      {
        name: "weight", kind: "literal", required: true,
        summary: "States the exact integer face weight from 1 through 1000.",
      },
      {
        name: "style", kind: "literal", required: true,
        values: ["normal", "italic", "oblique"],
        summary: "States the exact face style.",
      },
      mediaTypeField,
    ],
    children: [fontSourceShape],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [idBinding(id, mediaTypes.fontArtifact)];
  },
  async compile({ declaration, resolveAsset }) {
    const id = literal(declaration, "id");
    const weight = Number(literal(declaration, "weight"));
    if (!Number.isSafeInteger(weight) || weight < 1 || weight > 1_000) {
      throw new Error("Media weight must be an integer from 1 to 1000.");
    }
    const style = literal(declaration, "style");
    if (style !== "normal" && style !== "italic" && style !== "oblique") {
      throw new Error("Media style must be normal, italic or oblique.");
    }
    const source = optionalLiteral(declaration, "src");
    if (source !== undefined && declaration.children.length > 0) {
      throw new Error("Media Font must use either src or Source children, not both.");
    }
    if (source === undefined && declaration.children.length === 0) {
      throw new Error("Media Font requires src or one or more Source children.");
    }
    if (source === undefined && optionalLiteral(declaration, "media-type") !== undefined) {
      throw new Error("Media Font.media-type belongs on each Source when the face has multiple sources.");
    }
    const ownMediaType = optionalLiteral(declaration, "media-type");
    const sources: readonly DeclarationLike[] = source === undefined
      ? declaration.children
      : [{
          name: "Source",
          fields: [
            { name: "src", value: { kind: "literal" as const, value: source } },
            ...(ownMediaType === undefined ? [] : [{
              name: "media-type",
              value: { kind: "literal" as const, value: ownMediaType },
            }]),
          ],
          children: [],
          range: declaration.range,
        }];
    const artifacts: FontArtifactRef["sources"][number][] = [];
    for (const item of sources) {
      const locator = literal(item, "src");
      const mediaType = mediaTypeFor(item, locator, "font", fontMediaTypes);
      const artifact = await resolveAsset({ from: locator, mediaType, range: item.range ?? declaration.range });
      const unicodeRange = optionalLiteral(item, "unicode-range");
      artifacts.push({ artifact, ...(unicodeRange === undefined ? {} : { unicodeRange }) });
    }
    const font: FontArtifactRef = { sources: artifacts, weight, style };
    assertFontArtifactRef(font, `Media Font.${id}`);
    return {
      records: [{ id, type: mediaTypes.fontArtifact, value: font as unknown as CanonicalValue, range: declaration.range }],
      components: [],
    };
  },
};

async function authoredFont(
  declaration: DeclarationLike,
  name: string,
  resolveReference: (path: string) => Awaitable<AuthorResolvedReference | undefined>,
): Promise<FontArtifactRef> {
  const value = declarationField(declaration, name);
  if (value?.kind !== "reference") throw new Error(`Media ${name} must be a reference.`);
  const resolved = await resolveReference(value.path);
  if (resolved?.record === undefined) throw new Error(`Media ${name} must reference an authored FontArtifact.`);
  return resolved.record.value as unknown as FontArtifactRef;
}

export const mediaFontStackAuthorDeclaration: AuthorDeclarationCompiler = {
  module: mediaModuleRef,
  declaration: "font-stack",
  outputs: [mediaTypes.fontStack],
  shape: {
    summary: "Orders exact font faces into one primary-plus-fallback stack.",
    fields: [
      idField,
      {
        name: "primary", kind: "reference", required: true,
        accepts: [mediaTypes.fontArtifact], summary: "Selects the primary exact face.",
      },
    ],
    children: [{
      name: "Fallback", cardinality: "many", summary: "Appends one exact fallback face.",
      fields: [{
        name: "font", kind: "reference", required: true,
        accepts: [mediaTypes.fontArtifact], summary: "Selects one authored exact face.",
      }],
    }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [idBinding(id, mediaTypes.fontStack)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const faces = [await authoredFont(declaration, "primary", resolveReference)];
    for (const child of declaration.children) faces.push(await authoredFont(child, "font", resolveReference));
    const stack = { faces };
    assertFontStackRef(stack, `Media FontStack.${id}`);
    return {
      records: [{ id, type: mediaTypes.fontStack, value: stack as unknown as CanonicalValue, range: declaration.range }],
      components: [],
    };
  },
};

export const mediaAuthorDeclarations = [
  mediaImageAuthorDeclaration,
  mediaAudioAuthorDeclaration,
  mediaVideoAuthorDeclaration,
  mediaFontAuthorDeclaration,
  mediaFontStackAuthorDeclaration,
] as const;

/** Markup spellings are independent of Media's semantic declarations. */
export const mediaMarkupDeclarations = [
  { name: "image", tag: "Image" },
  { name: "audio", tag: "Audio" },
  { name: "video", tag: "Video" },
  { name: "font", tag: "Font" },
  { name: "font-stack", tag: "FontStack" },
] as const;
