import type { Timeline } from "@hypit/timeline";
import type { ProducerPackage, ProducerHandlerContext } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, Value } from "@hypit/hypit/protocol";
import type { SpatialFrame } from "@hypit/spatial";
import type { Text } from "@hypit/hypit/text";

import { commentStickerProducers, commentStickerTypes } from "./manifest.js";
import { appendProjectedCommentSticker, assertCommentStickerProgram, createCommentStickerSet, createCommentStickerContent, setCommentStickerContentText, finalizeCommentSticker, renderCommentSticker } from "./program.js";
import type {
  CommentStickerHeader,
  CommentStickerContent,
  CommentStickerItemSpec,
  CommentStickerProgram,
  CommentStickerSet,
  CommentStickerStyle,
} from "./types.js";
import type { TemporalWindow } from "@hypit/temporal";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

const output = (value: unknown) => ((canonicalize(value)));

function common(inputs: Record<string, { readonly value: Value } | undefined>) {
  return {
    set: valueOf<CommentStickerSet>(inputs.set?.value, "CommentStickerSet"),
    header: valueOf<CommentStickerHeader>(inputs.header?.value, "CommentStickerHeader"),
    timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
    frame: valueOf<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    style: valueOf<CommentStickerStyle>(inputs.style?.value, "CommentStickerStyle"),
    spec: valueOf<CommentStickerItemSpec>(inputs.spec?.value, "CommentStickerItemSpec"),
    content: valueOf<CommentStickerContent>(inputs.content?.value, "CommentStickerContent"),
    window: valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
  };
}

export const commentStickerComponent = {
  producers: [
    {
      producer: commentStickerProducers.createContent,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(createCommentStickerContent(
        valueOf<Text>(inputs.comment?.value, "Text"),
      )) }),
    },
    ...([
      [commentStickerProducers.setContentAuthor, "author"],
      [commentStickerProducers.setContentHeader, "header"],
      [commentStickerProducers.setContentMeta, "meta"],
    ] as const).map(([producer, field]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output" as const, value: output(setCommentStickerContentText(
        valueOf<CommentStickerContent>(inputs.content?.value, "CommentStickerContent"),
        field,
        valueOf<Text>(inputs[field]?.value, "Text"),
      )) }),
    })),
    {
      producer: commentStickerProducers.createSet,
      handler: () => ({ kind: "output" as const, value: output(createCommentStickerSet()) }),
    },
    ...([
      [commentStickerProducers.appendItem, false],
      [commentStickerProducers.appendItemAvatar, true],
    ] as const).map(([producer, avatar]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const values = common(inputs);
        return { kind: "output" as const, value: output(appendProjectedCommentSticker(
          values.set, values.header, values.timeline, values.frame, values.style, values.spec, values.content, values.window,
          avatar ? valueOf<BlobRef>(inputs.avatar?.value, "Comment Sticker avatar") : undefined,
        )) };
      },
    })),
    {
      producer: commentStickerProducers.finalize,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(finalizeCommentSticker(
        valueOf<CommentStickerSet>(inputs.set?.value, "CommentStickerSet"),
        valueOf<CommentStickerHeader>(inputs.header?.value, "CommentStickerHeader"),
      )) }),
    },
    {
      producer: commentStickerProducers.render,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(renderCommentSticker(
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<CommentStickerProgram>(inputs.program?.value, "CommentStickerProgram"),
      )) }),
    },
  ],
  refinements: [{
    type: commentStickerTypes.program,
    handler: ({ value }) => assertCommentStickerProgram(valueOf<CommentStickerProgram>(value, "CommentStickerProgram")),
  }],
} satisfies ProducerPackage & RefinementPackage;
