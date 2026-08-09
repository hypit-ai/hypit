import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { fontArtifactSchema, mediaDependency } from "@narratage/media";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@narratage/spatial";
import { temporalDependency } from "@narratage/temporal";

import { commentStickerImplementationDigests, commentStickerValidatorDigests } from "./program.js";

export const commentStickerModuleRef = { name: "@narratage/comment-sticker", version: "1" } as const;

export const commentStickerTypes = {
  header: { module: commentStickerModuleRef, name: "CommentStickerHeader" },
  style: { module: commentStickerModuleRef, name: "CommentStickerStyle" },
  itemSpec: { module: commentStickerModuleRef, name: "CommentStickerItemSpec" },
  set: { module: commentStickerModuleRef, name: "CommentStickerSet" },
  program: { module: commentStickerModuleRef, name: "CommentStickerProgram" },
} satisfies Record<string, TypeRef>;

export const commentStickerProducers = {
  createSet: { module: commentStickerModuleRef, name: "create-comment-sticker-set" },
  appendProgram: { module: commentStickerModuleRef, name: "append-program-comment-sticker" },
  appendProgramAvatar: { module: commentStickerModuleRef, name: "append-program-comment-sticker-avatar" },
  appendSelection: { module: commentStickerModuleRef, name: "append-selection-comment-sticker" },
  appendSelectionAvatar: { module: commentStickerModuleRef, name: "append-selection-comment-sticker-avatar" },
  appendMoment: { module: commentStickerModuleRef, name: "append-moment-comment-sticker" },
  appendMomentAvatar: { module: commentStickerModuleRef, name: "append-moment-comment-sticker-avatar" },
  finalize: { module: commentStickerModuleRef, name: "finalize-comment-sticker" },
  render: { module: commentStickerModuleRef, name: "render-comment-sticker" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const nonNegative = { kind: "number", minimum: 0 } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });
const blobRef = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
  size: { schema: unsignedInteger },
  mediaType: { schema: string },
});
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: positiveInteger } }),
] };
const point: ValueSchema = { kind: "oneOf", variants: [
  ...["program.start", "program.end", "selection.start", "selection.end", "moment.cue"].map((ref) => object({
    ref: { schema: { kind: "literal", value: ref } }, offset: { schema: duration, optional: true },
  })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: duration } }),
] };
const projection = object({ start: { schema: point }, end: { schema: point } });
const textStyle = object({
  fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } },
  sizePx: { schema: positive }, weight: { schema: positiveInteger }, lineHeight: { schema: positive }, color: { schema: string },
});
const style = object({
  contract: { schema: { kind: "literal", value: "svml.comment-sticker-style@1" } },
  id: { schema: string }, stackingOrder: { schema: integer },
  card: { schema: object({
    background: { schema: string }, borderColor: { schema: string }, borderWidthPx: { schema: nonNegative },
    radiusPx: { schema: nonNegative }, paddingXPx: { schema: nonNegative }, paddingYPx: { schema: nonNegative },
    gapPx: { schema: nonNegative }, rotationDeg: { schema: number },
    shadow: { schema: object({ color: { schema: string }, offsetX: { schema: number }, offsetY: { schema: number }, blurPx: { schema: nonNegative }, spreadPx: { schema: number } }) },
    tail: { schema: object({ enabled: { schema: { kind: "boolean" } }, widthPx: { schema: nonNegative }, heightPx: { schema: nonNegative }, offsetXPx: { schema: nonNegative } }) },
  }) },
  avatar: { schema: object({
    fallback: { schema: enumString(["none", "initial"]) }, sizePx: { schema: positive }, borderWidthPx: { schema: nonNegative },
    borderColor: { schema: string }, background: { schema: string }, textColor: { schema: string },
  }) },
  header: { schema: textStyle },
  body: { schema: object({
    fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } },
    sizePx: { schema: positive }, weight: { schema: positiveInteger }, lineHeight: { schema: positive }, color: { schema: string },
    maxLines: { schema: positiveInteger },
  }) },
  meta: { schema: textStyle },
  motion: { schema: object({
    enter: { schema: object({
      kind: { schema: enumString(["none", "fade", "pop", "slide-pop"]) }, durationFrames: { schema: unsignedInteger },
      offsetYPx: { schema: number }, startScale: { schema: positive }, rotationDeltaDeg: { schema: number },
      easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]) },
    }) },
    exit: { schema: object({
      kind: { schema: enumString(["none", "fade", "fade-up"]) }, durationFrames: { schema: unsignedInteger },
      offsetYPx: { schema: number }, easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]) },
    }) },
    hold: { schema: object({
      kind: { schema: enumString(["none", "float"]) }, amplitudeYPx: { schema: nonNegative },
      rotationAmplitudeDeg: { schema: nonNegative }, periodFrames: { schema: positiveInteger },
    }) },
  }) },
});
const content = object({
  comment: { schema: string }, author: { schema: string, optional: true },
  header: { schema: string, optional: true }, meta: { schema: string, optional: true },
});
const itemSpec = object({
  contract: { schema: { kind: "literal", value: "svml.comment-sticker-item-spec@1" } },
  id: { schema: string }, content: { schema: content }, projection: { schema: projection },
  expansion: { schema: object({ kind: { schema: enumString(["one", "each"]) } }) },
});
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: positiveInteger } });
const item = object({
  id: { schema: string }, sourceOccurrenceId: { schema: string }, span: { schema: frameSpan },
  frame: { schema: spatialFrameSchema }, style: { schema: style }, content: { schema: content },
  avatar: { schema: blobRef, optional: true }, tieBreak: { schema: string },
});

export const commentStickerHeaderSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.comment-sticker-header@1" } }, id: { schema: string },
});
export const commentStickerStyleSchema: ValueSchema = style;
export const commentStickerItemSpecSchema: ValueSchema = itemSpec;
export const commentStickerSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.comment-sticker-set@1" } }, items: { schema: { kind: "array", items: item } },
});
export const commentStickerProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.comment-sticker-program@1" } }, id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});

export const commentStickerStyleSurfaceImplementationDigest = digestOf("@narratage/comment-sticker/style-surface@1");
export const commentStickerTrackSurfaceImplementationDigest = digestOf("@narratage/comment-sticker/track-surface@1");
const registered = (locator: string, digest: ReturnType<typeof digestOf>) => ({ kind: "registered" as const, locator, digest });
const validator = (locator: string, digest: ReturnType<typeof digestOf>) => ({ abi: "svml.type-validator@1" as const, implementation: registered(locator, digest) });
const appendInputs = [
  { name: "set", type: commentStickerTypes.set }, { name: "header", type: commentStickerTypes.header },
  { name: "frame", type: spatialTypes.frame }, { name: "style", type: commentStickerTypes.style },
  { name: "space", type: programSpaceTypes.programSpace }, { name: "spec", type: commentStickerTypes.itemSpec },
] as const;

export const commentStickerManifest: ModuleManifest = {
  format: "svml.module@1",
  name: commentStickerModuleRef.name,
  version: commentStickerModuleRef.version,
  dependencies: [artifactDependency, narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, mediaDependency, compositionDependency],
  types: [
    { name: commentStickerTypes.header.name, schema: commentStickerHeaderSchema },
    { name: commentStickerTypes.style.name, schema: commentStickerStyleSchema },
    { name: commentStickerTypes.itemSpec.name, schema: commentStickerItemSpecSchema },
    { name: commentStickerTypes.set.name, schema: commentStickerSetSchema },
    { name: commentStickerTypes.program.name, schema: commentStickerProgramSchema, validator: validator("@narratage/comment-sticker/validate-program", commentStickerValidatorDigests.program) },
  ],
  capabilities: [],
  surfaces: [
    { name: "style", tag: "Style", mode: "structured", outputs: [commentStickerTypes.style], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/comment-sticker/style-surface", digest: commentStickerStyleSurfaceImplementationDigest } },
    { name: "track", tag: "Track", mode: "structured", outputs: [commentStickerTypes.header, commentStickerTypes.itemSpec, commentStickerTypes.program, compositionTypes.visualTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/comment-sticker/track-surface", digest: commentStickerTrackSurfaceImplementationDigest } },
  ],
  producers: [
    { name: commentStickerProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: commentStickerTypes.set }], needs: [], implementation: registered("@narratage/comment-sticker/create-set", commentStickerImplementationDigests.createSet) },
    ...([
      [commentStickerProducers.appendProgram, commentStickerImplementationDigests.appendProgram, "@narratage/comment-sticker/append-program", []],
      [commentStickerProducers.appendProgramAvatar, commentStickerImplementationDigests.appendProgramAvatar, "@narratage/comment-sticker/append-program-avatar", [{ name: "avatar", type: artifactTypes.blob }]],
      [commentStickerProducers.appendSelection, commentStickerImplementationDigests.appendSelection, "@narratage/comment-sticker/append-selection", [{ name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }]],
      [commentStickerProducers.appendSelectionAvatar, commentStickerImplementationDigests.appendSelectionAvatar, "@narratage/comment-sticker/append-selection-avatar", [{ name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }, { name: "avatar", type: artifactTypes.blob }]],
      [commentStickerProducers.appendMoment, commentStickerImplementationDigests.appendMoment, "@narratage/comment-sticker/append-moment", [{ name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }]],
      [commentStickerProducers.appendMomentAvatar, commentStickerImplementationDigests.appendMomentAvatar, "@narratage/comment-sticker/append-moment-avatar", [{ name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }, { name: "avatar", type: artifactTypes.blob }]],
    ] as const).map(([producer, implementationDigest, locator, extra]) => ({
      name: producer.name,
      inputs: [...appendInputs, ...extra],
      outputs: [{ name: "set", type: commentStickerTypes.set }],
      needs: [],
      implementation: registered(locator, implementationDigest),
    })),
    { name: commentStickerProducers.finalize.name, inputs: [{ name: "set", type: commentStickerTypes.set }, { name: "header", type: commentStickerTypes.header }], outputs: [{ name: "program", type: commentStickerTypes.program }], needs: [], implementation: registered("@narratage/comment-sticker/finalize", commentStickerImplementationDigests.finalize) },
    { name: commentStickerProducers.render.name, inputs: [{ name: "canvas", type: spatialTypes.canvas }, { name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: commentStickerTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered("@narratage/comment-sticker/render", commentStickerImplementationDigests.render) },
  ],
};

export const commentStickerManifestDigest = digestOf(commentStickerManifest);
export const commentStickerDependency = { module: commentStickerModuleRef, digest: commentStickerManifestDigest } as const;
