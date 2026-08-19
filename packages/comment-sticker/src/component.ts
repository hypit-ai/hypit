import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, StoredValue } from "@hypit/protocol";
import type { CompleteSemanticMap } from "@hypit/semantic-map";
import type { CanvasSpace, SpatialFrame } from "@hypit/spatial";
import type { Text } from "@hypit/text";

import { commentStickerProducers, commentStickerTypes } from "./manifest.js";
import { appendMomentCommentSticker, appendProgramCommentSticker, appendSelectionCommentSticker, assertCommentStickerProgram, createCommentStickerSet, createCommentStickerContent, setCommentStickerContentText, finalizeCommentSticker, renderCommentSticker } from "./program.js";
import type {
  CommentStickerHeader,
  CommentStickerContent,
  CommentStickerItemSpec,
  CommentStickerProgram,
  CommentStickerSet,
  CommentStickerStyle,
} from "./types.js";

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
    space: inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
    spec: inline<CommentStickerItemSpec>(inputs.spec?.value, "CommentStickerItemSpec"),
    content: inline<CommentStickerContent>(inputs.content?.value, "CommentStickerContent"),
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
      [commentStickerProducers.appendProgram, false],
      [commentStickerProducers.appendProgramAvatar, true],
    ] as const).map(([producer, avatar]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const values = common(inputs);
        return { outputs: { set: output(appendProgramCommentSticker(
          values.set, values.header, values.frame, values.style, values.space, values.spec, values.content,
          ...(avatar ? [inline<BlobRef>(inputs.avatar?.value, "Comment Sticker avatar")] : []),
        )) }, needs: {} };
      },
    })),
    ...([
      [commentStickerProducers.appendSelection, false],
      [commentStickerProducers.appendSelectionAvatar, true],
    ] as const).map(([producer, avatar]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const values = common(inputs);
        return { outputs: { set: output(appendSelectionCommentSticker(
          values.set, values.header, values.frame, values.style, values.space,
          inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
          inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"), values.spec, values.content,
          ...(avatar ? [inline<BlobRef>(inputs.avatar?.value, "Comment Sticker avatar")] : []),
        )) }, needs: {} };
      },
    })),
    ...([
      [commentStickerProducers.appendMoment, false],
      [commentStickerProducers.appendMomentAvatar, true],
    ] as const).map(([producer, avatar]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const values = common(inputs);
        return { outputs: { set: output(appendMomentCommentSticker(
          values.set, values.header, values.frame, values.style, values.space,
          inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
          inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"), values.spec, values.content,
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
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<CommentStickerProgram>(inputs.program?.value, "CommentStickerProgram"),
      )) }, needs: {} }),
    },
  ],
  validators: [{
    type: commentStickerTypes.program,
    handler: ({ value }) => assertCommentStickerProgram(inline<CommentStickerProgram>(value, "CommentStickerProgram")),
  }],
} satisfies ComponentPackage;
