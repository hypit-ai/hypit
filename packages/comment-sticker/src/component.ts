import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, StoredValue } from "@hypit/protocol";
import type { SemanticTrack } from "@hypit/semantic-track";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import type { CanvasSpace, SpatialFrame } from "@hypit/spatial";
import type { Text } from "@hypit/text";

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

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function common(inputs: Record<string, { readonly value: StoredValue } | undefined>) {
  return {
    set: inline<CommentStickerSet>(inputs.set?.value, "CommentStickerSet"),
    header: inline<CommentStickerHeader>(inputs.header?.value, "CommentStickerHeader"),
    frame: inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    style: inline<CommentStickerStyle>(inputs.style?.value, "CommentStickerStyle"),
    semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
    spec: inline<CommentStickerItemSpec>(inputs.spec?.value, "CommentStickerItemSpec"),
    content: inline<CommentStickerContent>(inputs.content?.value, "CommentStickerContent"),
    window: inline<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
  };
}

export const commentStickerComponent = {
  producers: [
    {
      producer: commentStickerProducers.createContent,
      handler: ({ inputs }) => ({ outputs: { content: output(createCommentStickerContent(
        inline<Text>(inputs.comment?.value, "Text"),
      )) }, needs: {} }),
    },
    ...([
      [commentStickerProducers.setContentAuthor, "author"],
      [commentStickerProducers.setContentHeader, "header"],
      [commentStickerProducers.setContentMeta, "meta"],
    ] as const).map(([producer, field]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { content: output(setCommentStickerContentText(
        inline<CommentStickerContent>(inputs.content?.value, "CommentStickerContent"),
        field,
        inline<Text>(inputs[field]?.value, "Text"),
      )) }, needs: {} }),
    })),
    {
      producer: commentStickerProducers.createSet,
      handler: () => ({ outputs: { set: output(createCommentStickerSet()) }, needs: {} }),
    },
    ...([
      [commentStickerProducers.appendItem, false],
      [commentStickerProducers.appendItemAvatar, true],
    ] as const).map(([producer, avatar]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const values = common(inputs);
        return { outputs: { set: output(appendProjectedCommentSticker(
          values.set, values.header, values.frame, values.style, values.spec, values.content, values.window,
          ...(avatar ? [inline<BlobRef>(inputs.avatar?.value, "Comment Sticker avatar")] : []),
        )) }, needs: {} };
      },
    })),
    {
      producer: commentStickerProducers.finalize,
      handler: ({ inputs }) => ({ outputs: { program: output(finalizeCommentSticker(
        inline<CommentStickerSet>(inputs.set?.value, "CommentStickerSet"),
        inline<CommentStickerHeader>(inputs.header?.value, "CommentStickerHeader"),
      )) }, needs: {} }),
    },
    {
      producer: commentStickerProducers.render,
      handler: ({ inputs }) => ({ outputs: { track: output(renderCommentSticker(
        inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"),
        projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")),
        inline<CommentStickerProgram>(inputs.program?.value, "CommentStickerProgram"),
      )) }, needs: {} }),
    },
  ],
  validators: [{
    type: commentStickerTypes.program,
    handler: ({ value }) => assertCommentStickerProgram(inline<CommentStickerProgram>(value, "CommentStickerProgram")),
  }],
} satisfies ComponentPackage;
