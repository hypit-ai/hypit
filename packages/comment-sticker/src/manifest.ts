import { frameSpanSchema, timelineTypes, timelineDependency } from "@hypit/timeline";

import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { fontArtifactSchema, mediaDependency } from "@hypit/media";

import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@hypit/spatial";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { textDependency, textTypes } from "@hypit/hypit/text";

export const commentStickerModuleRef = { name: "@hypit/comment-sticker", version: "1" } as const;

export const commentStickerTypes = {
  header: { module: commentStickerModuleRef, name: "CommentStickerHeader" },
  style: { module: commentStickerModuleRef, name: "CommentStickerStyle" },
  itemSpec: { module: commentStickerModuleRef, name: "CommentStickerItemSpec" },
  content: { module: commentStickerModuleRef, name: "CommentStickerContent" },
  set: { module: commentStickerModuleRef, name: "CommentStickerSet" },
  program: { module: commentStickerModuleRef, name: "CommentStickerProgram" },
} satisfies Record<string, TypeRef>;

export const commentStickerProducers = {
  createSet: { module: commentStickerModuleRef, name: "create-comment-sticker-set" },
  appendItem: { module: commentStickerModuleRef, name: "append-comment-sticker" },
  appendItemAvatar: { module: commentStickerModuleRef, name: "append-comment-sticker-with-avatar" },
  finalize: { module: commentStickerModuleRef, name: "finalize-comment-sticker" },
  render: { module: commentStickerModuleRef, name: "render-comment-sticker" },
  createContent: { module: commentStickerModuleRef, name: "create-comment-sticker-content" },
  setContentAuthor: { module: commentStickerModuleRef, name: "set-comment-sticker-content-author" },
  setContentHeader: { module: commentStickerModuleRef, name: "set-comment-sticker-content-header" },
  setContentMeta: { module: commentStickerModuleRef, name: "set-comment-sticker-content-meta" },
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
const blobRef = blobRefSchema();
const textStyle = object({
  fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } },
  sizePx: { schema: positive }, weight: { schema: positiveInteger }, lineHeight: { schema: positive }, color: { schema: string },
});
const style = object({

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
      easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out", "out-back"]) },
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

  id: { schema: string },
});
const item = object({
  id: { schema: string }, span: { schema: frameSpanSchema },
  frame: { schema: spatialFrameSchema }, style: { schema: style }, content: { schema: content },
  avatar: { schema: blobRef, optional: true },
});

export const commentStickerHeaderSchema: ValueSchema = object({
  id: { schema: string },
});
export const commentStickerStyleSchema: ValueSchema = style;
export const commentStickerItemSpecSchema: ValueSchema = itemSpec;
export const commentStickerSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: item } },
});
export const commentStickerProgramSchema: ValueSchema = object({
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});
const appendInputs = [
  { name: "set", type: commentStickerTypes.set }, { name: "header", type: commentStickerTypes.header },
  { name: "timeline", type: timelineTypes.timeline },
  { name: "frame", type: spatialTypes.frame }, { name: "style", type: commentStickerTypes.style },
  { name: "spec", type: commentStickerTypes.itemSpec },
  { name: "content", type: commentStickerTypes.content }, { name: "window", type: temporalTypes.window },
] as const;

export const commentStickerManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: commentStickerModuleRef.name,
  version: commentStickerModuleRef.version,
  dependencies: [blobDependency, timelineDependency, spatialDependency, temporalDependency, mediaDependency, compositionDependency, textDependency],
  types: [
    commentStickerTypes.header.name,
    commentStickerTypes.style.name,
    commentStickerTypes.itemSpec.name,
    commentStickerTypes.content.name,
    commentStickerTypes.set.name,
    commentStickerTypes.program.name,
  ],
  capabilities: [],
  producers: [
    { name: commentStickerProducers.createContent.name, inputs: [{ name: "comment", type: textTypes.text }], result: { kind: "output" as const, name: "content", type: commentStickerTypes.content } },
    ...([
      [commentStickerProducers.setContentAuthor, "author"],
      [commentStickerProducers.setContentHeader, "header"],
      [commentStickerProducers.setContentMeta, "meta"],
    ] as const).map(([producer, field]) => ({
      name: producer.name,
      inputs: [{ name: "content", type: commentStickerTypes.content }, { name: field, type: textTypes.text }],
      result: { kind: "output" as const, name: "content", type: commentStickerTypes.content },
    })),
    { name: commentStickerProducers.createSet.name, inputs: [], result: { kind: "output" as const, name: "set", type: commentStickerTypes.set } },
    ...([
      [commentStickerProducers.appendItem, []],
      [commentStickerProducers.appendItemAvatar, [{ name: "avatar", type: blobTypes.blob }]],
    ] as const).map(([producer, extra]) => ({
      name: producer.name,
      inputs: [...appendInputs, ...extra],
      result: { kind: "output" as const, name: "set", type: commentStickerTypes.set },
    })),
    { name: commentStickerProducers.finalize.name, inputs: [{ name: "set", type: commentStickerTypes.set }, { name: "header", type: commentStickerTypes.header }], result: { kind: "output" as const, name: "program", type: commentStickerTypes.program } },
    { name: commentStickerProducers.render.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "program", type: commentStickerTypes.program }], result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack } },
  ],
};

export const commentStickerDependency = commentStickerModuleRef;
