import type { ComponentPackage, ProducerHandlerContext } from "@narratage/component-kit";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize } from "@narratage/protocol";
import type { BlobRef, StoredValue } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";
import type { Text } from "@narratage/text";

import { commentStickerProducers, commentStickerTypes } from "./manifest.js";
import {
  appendMomentCommentSticker,
  appendProgramCommentSticker,
  appendSelectionCommentSticker,
  assertCommentStickerProgram,
  commentStickerImplementationDigests,
  commentStickerValidatorDigests,
  createCommentStickerSet,
  createCommentStickerContent,
  setCommentStickerContentText,
  finalizeCommentSticker,
  renderCommentSticker,
} from "./program.js";
import { commentStickerRecipeFacet } from "./recipe-facet.js";
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
  name: "@narratage/comment-sticker",
  producers: [
    {
      producer: commentStickerProducers.createContent,
      implementationDigest: commentStickerImplementationDigests.createContent,
      handler: ({ inputs }) => ({ outputs: { content: output(createCommentStickerContent(
        inline<Text>(inputs.comment?.value, "Text"),
      )) }, needs: {} }),
    },
    ...([
      [commentStickerProducers.setContentAuthor, commentStickerImplementationDigests.setContentAuthor, "author"],
      [commentStickerProducers.setContentHeader, commentStickerImplementationDigests.setContentHeader, "header"],
      [commentStickerProducers.setContentMeta, commentStickerImplementationDigests.setContentMeta, "meta"],
    ] as const).map(([producer, implementationDigest, field]) => ({
      producer,
      implementationDigest,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { content: output(setCommentStickerContentText(
        inline<CommentStickerContent>(inputs.content?.value, "CommentStickerContent"),
        field,
        inline<Text>(inputs[field]?.value, "Text"),
      )) }, needs: {} }),
    })),
    {
      producer: commentStickerProducers.createSet,
      implementationDigest: commentStickerImplementationDigests.createSet,
      handler: () => ({ outputs: { set: output(createCommentStickerSet()) }, needs: {} }),
    },
    ...([
      [commentStickerProducers.appendProgram, commentStickerImplementationDigests.appendProgram, false],
      [commentStickerProducers.appendProgramAvatar, commentStickerImplementationDigests.appendProgramAvatar, true],
    ] as const).map(([producer, implementationDigest, avatar]) => ({
      producer,
      implementationDigest,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const values = common(inputs);
        return { outputs: { set: output(appendProgramCommentSticker(
          values.set, values.header, values.frame, values.style, values.space, values.spec, values.content,
          ...(avatar ? [inline<BlobRef>(inputs.avatar?.value, "Comment Sticker avatar")] : []),
        )) }, needs: {} };
      },
    })),
    ...([
      [commentStickerProducers.appendSelection, commentStickerImplementationDigests.appendSelection, false],
      [commentStickerProducers.appendSelectionAvatar, commentStickerImplementationDigests.appendSelectionAvatar, true],
    ] as const).map(([producer, implementationDigest, avatar]) => ({
      producer,
      implementationDigest,
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
      [commentStickerProducers.appendMoment, commentStickerImplementationDigests.appendMoment, false],
      [commentStickerProducers.appendMomentAvatar, commentStickerImplementationDigests.appendMomentAvatar, true],
    ] as const).map(([producer, implementationDigest, avatar]) => ({
      producer,
      implementationDigest,
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
      implementationDigest: commentStickerImplementationDigests.finalize,
      handler: ({ inputs }) => ({ outputs: { program: output(finalizeCommentSticker(
        inline<CommentStickerSet>(inputs.set?.value, "CommentStickerSet"),
        inline<CommentStickerHeader>(inputs.header?.value, "CommentStickerHeader"),
      )) }, needs: {} }),
    },
    {
      producer: commentStickerProducers.render,
      implementationDigest: commentStickerImplementationDigests.render,
      handler: ({ inputs }) => ({ outputs: { track: output(renderCommentSticker(
        inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<CommentStickerProgram>(inputs.program?.value, "CommentStickerProgram"),
      )) }, needs: {} }),
    },
  ],
  validators: [{
    type: commentStickerTypes.program,
    implementationDigest: commentStickerValidatorDigests.program,
    handler: ({ value }) => assertCommentStickerProgram(inline<CommentStickerProgram>(value, "CommentStickerProgram")),
  }],
  recipes: [commentStickerRecipeFacet],
} satisfies ComponentPackage;
