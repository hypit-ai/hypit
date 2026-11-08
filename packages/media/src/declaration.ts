import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type Awaitable,
} from "@hypit/author";
import { blobTypes } from "@hypit/blob";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/protocol";
import { temporalTypes } from "@hypit/temporal-graph";
import type { MediaDeliverySpec } from "./types.js";
import { mediaDeliveryProfile } from "./delivery.js";

import { mediaModuleRef, mediaTypes } from "./manifest.js";
import { mediaSourceFragment } from "./fragment.js";
import {
  namedPictureInterpretation,
  sealMediaSelectionRequest,
} from "./selection.js";
import type {
  MediaAudioSelector,
  MediaSelectionRequest,
  MediaVideoSelector,
} from "./types.js";
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

function streamIndex(value: string, kind: "video"): MediaVideoSelector;
function streamIndex(value: string, kind: "audio"): MediaAudioSelector;
function streamIndex(value: string, kind: "video" | "audio"): MediaVideoSelector | MediaAudioSelector {
  if (kind === "video" && value === "primary-moving") return { mode: "primary-moving" };
  if (kind === "video" && value === "primary-picture") return { mode: "primary-picture" };
  if (kind === "audio" && (value === "default" || value === "default-if-present")) return { mode: value };
  if (value === "none") return { mode: "none" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) {
    throw new Error(`Media ${kind} must be ${kind === "video" ? "primary-moving or primary-picture" : "default or default-if-present"}, none or stream:<index>.`);
  }
  return { mode: "stream-index", streamIndex: Number(match[1]) };
}

function mediaDeclaration(
  declaration: "image" | "audio" | "video",
  kind: "image" | "audio" | "video",
  known: ReadonlyMap<string, string>,
): AuthorDeclarationCompiler {
  const outputTypes = [
    blobTypes.blob,
    mediaTypes.selectionRequest,
    mediaTypes.domainSpec,
    mediaTypes.prepared,
    ...(kind === "image" ? [] : [temporalTypes.localDomain, temporalTypes.extent]),
  ];
  return {
    module: mediaModuleRef,
    declaration,
    outputs: outputTypes,
    shape: {
      summary: `Publishes one ${kind} Media object with a direct Resource facet and lazy prepared facets.`,
      fields: [
        idField,
        { ...sourceField, required: false },
        { name: "source", kind: "reference", required: false, accepts: [blobTypes.blob],
          summary: "Uses a Resource produced elsewhere instead of resolving an asset." },
        mediaTypeField,
        { name: "video", kind: "literal", required: false,
          summary: "Overrides moving-picture selection." },
        { name: "audio", kind: "literal", required: false,
          summary: "Overrides audio selection." },
        { name: "picture", kind: "literal", required: false, values: ["source", "sdr-bt709"],
          summary: "Selects the source picture interpretation or one explicit supported profile." },
        { name: "span-authority", kind: "literal", required: false, values: ["video", "audio"],
          summary: "Overrides which selected signal defines the prepared local extent." },
      ],
    },
    bindings(value) {
      const id = literal(value, "id");
      return [
        { name: id, ref: { kind: "component-output", component: id, output: "default" }, type: blobTypes.blob },
        { name: `${id}.resource`, ref: { kind: "component-output", component: id, output: "resource" }, type: blobTypes.blob },
        { name: `${id}.source`, ref: { kind: "component-output", component: id, output: "source" }, type: mediaTypes.prepared },
        ...(kind === "image" ? [] : [
          { name: `${id}.domain`, ref: { kind: "component-output" as const, component: id, output: "domain" }, type: temporalTypes.localDomain },
          { name: `${id}.extent`, ref: { kind: "component-output" as const, component: id, output: "extent" }, type: temporalTypes.extent },
        ]),
      ];
    },
    async compile({ declaration: value, resolveAsset, resolveReference }) {
      const id = literal(value, "id");
      const authoredSource = declarationField(value, "source");
      const sourcePath = optionalLiteral(value, "src");
      if ((sourcePath === undefined) === (authoredSource === undefined)) {
        throw new Error(`Media ${declaration} requires exactly one of src or source.`);
      }
      if (sourcePath === undefined && optionalLiteral(value, "media-type") !== undefined) {
        throw new Error(`Media ${declaration}.media-type can only accompany src.`);
      }

      const records: Array<{ id: string; type: TypeRef; value: CanonicalValue; range: AuthorDeclaration["range"] }> = [];
      let resourceRef: AuthorResolvedReference["ref"];
      if (sourcePath !== undefined) {
        const mediaType = mediaTypeFor(value, sourcePath, kind, known);
        const resolved = await resolveAsset({ from: sourcePath, mediaType, range: value.range });
        if (!resolved.mediaType.startsWith(`${kind}/`)) {
          throw new Error(`Media src did not resolve to an ${kind} artifact.`);
        }
        const inputId = `${id}.input`;
        records.push({ id: inputId, type: blobTypes.blob, value: resolved, range: value.range });
        resourceRef = { kind: "record", id: inputId };
      } else {
        if (authoredSource?.kind !== "reference") throw new Error(`Media ${declaration}.source must be a reference.`);
        const resolved = await resolveReference(authoredSource.path);
        if (resolved === undefined || !sameType(resolved.type, blobTypes.blob)) {
          throw new Error(`Media ${declaration}.source must reference a Resource.`);
        }
        resourceRef = resolved.ref;
      }

      const defaultVideo = kind === "video" ? "primary-moving" : kind === "image" ? "primary-picture" : "none";
      const defaultAudio = kind === "video" ? "default-if-present" : kind === "audio" ? "default" : "none";
      const video = streamIndex(optionalLiteral(value, "video") ?? defaultVideo, "video");
      const audio = streamIndex(optionalLiteral(value, "audio") ?? defaultAudio, "audio");
      const spanAuthority = optionalLiteral(value, "span-authority") ?? (kind === "image" ? undefined : kind);
      if (spanAuthority !== undefined && spanAuthority !== "video" && spanAuthority !== "audio") {
        throw new Error(`Media ${declaration}.span-authority must be video or audio.`);
      }
      const pictureName = optionalLiteral(value, "picture") ?? "source";
      const picture: MediaSelectionRequest["picture"] = video.mode === "none"
        ? { mode: "none" }
        : pictureName === "source"
          ? { mode: "source" }
          : pictureName === "sdr-bt709"
            ? { mode: "explicit", interpretation: namedPictureInterpretation("sdr-bt709") }
            : (() => { throw new Error(`Media ${declaration}.picture must be source or sdr-bt709.`); })();
      const requestId = `${id}.request`;
      const domainId = `${id}.domain-spec`;
      records.push(
        { id: requestId, type: mediaTypes.selectionRequest,
          value: sealMediaSelectionRequest({ video, audio,
            ...(spanAuthority === undefined ? {} : { spanAuthority }), picture }) as unknown as CanonicalValue,
          range: value.range },
        { id: domainId, type: mediaTypes.domainSpec, value: { id } as CanonicalValue, range: value.range },
      );
      return {
        records,
        components: [{
          id,
          fragment: mediaSourceFragment,
          inputs: {
            resource: resourceRef,
            request: { kind: "record", id: requestId },
            domain: { kind: "record", id: domainId },
          },
          outputs: {
            default: id,
            resource: `${id}.resource`,
            source: `${id}.source`,
            ...(kind === "image" ? {} : { domain: `${id}.domain`, extent: `${id}.extent` }),
          },
          range: value.range,
        }],
      };
    },
  };
}

export const mediaImageAuthorDeclaration = mediaDeclaration("image", "image", imageMediaTypes);
export const mediaAudioAuthorDeclaration = mediaDeclaration("audio", "audio", audioMediaTypes);
export const mediaVideoAuthorDeclaration = mediaDeclaration("video", "video", videoMediaTypes);

export const mediaDeliveryAuthorDeclaration: AuthorDeclarationCompiler = {
  module: mediaModuleRef,
  declaration: "delivery",
  outputs: [mediaTypes.delivery],
  shape: {
    summary: "Defines one explicit final media delivery requirement independently of its Provider.",
    fields: [
      idField,
      { name: "profile", kind: "literal", required: true, values: ["bt709-h264"],
        summary: "Selects one complete standard signal and coded-video family." },
      { name: "quality", kind: "literal", required: false, values: ["draft", "standard", "high"],
        summary: "States the author-visible delivery quality target." },
      { name: "matte", kind: "literal", required: false,
        summary: "States the opaque hexadecimal background used for remaining transparency." },
    ],
  },
  bindings(declaration) {
    return [idBinding(literal(declaration, "id"), mediaTypes.delivery)];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    const profile = literal(declaration, "profile");
    const quality = optionalLiteral(declaration, "quality") ?? "standard";
    const matte = optionalLiteral(declaration, "matte") ?? "#000000";
    if (profile !== "bt709-h264") throw new Error("Media Delivery.profile must be bt709-h264.");
    if (quality !== "draft" && quality !== "standard" && quality !== "high") {
      throw new Error("Media Delivery.quality must be draft, standard or high.");
    }
    const delivery: MediaDeliverySpec = mediaDeliveryProfile(profile, { quality, matte });
    return { records: [{ id, type: mediaTypes.delivery,
      value: delivery as unknown as CanonicalValue, range: declaration.range }], components: [] };
  },
};

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
      const unicodeRange = optionalLiteral(item, "unicode-range")?.replace(/\s+/gu, "");
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
  mediaDeliveryAuthorDeclaration,
  mediaFontAuthorDeclaration,
  mediaFontStackAuthorDeclaration,
] as const;
