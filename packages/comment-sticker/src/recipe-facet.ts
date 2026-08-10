import type { RecipeFacet } from "@narratage/component-kit";
import type { FontStackRef } from "@narratage/media";
import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import { decodeCommentStickerStyle } from "./author.js";
import { commentStickerRecipeSchema } from "./recipe-schema.js";
import type { CommentStickerItemProgram, CommentStickerProgram } from "./types.js";

/**
 * Writing a Comment Sticker Recipe, without a stylesheet around it.
 *
 * The Surface reaches the same `decodeCommentStickerStyle` from an authored
 * element; this reaches it from loose properties, so an editor can show what a
 * Recipe does before there is a `.svml` to put it in. The lowering is shared
 * rather than repeated, which is what keeps the preview honest.
 */

const STYLE_ID = "preview";

function asProgram(value: CanonicalValue | undefined): Partial<CommentStickerProgram> {
  return value !== null && typeof value === "object" ? value as Partial<CommentStickerProgram> : {};
}

/**
 * Faces already in hand.
 *
 * A Recipe names no font at all here — the Style Surface takes one beside it —
 * so whatever faces an item was built with stay its own, and when there are
 * none `decodeCommentStickerStyle` says so in its own words rather than this
 * inventing a digest to get past it. The body's faces stand for the item
 * because the decoder gives one stack to all three roles regardless.
 */
function carriedStack(item: Partial<CommentStickerItemProgram>): FontStackRef {
  const faces = item.style?.body.fonts;
  return { contract: "svml.font-stack@1", faces: Array.isArray(faces) ? faces : [] };
}

function styleFor(
  properties: Readonly<Record<string, CanonicalValue>>,
  item: Partial<CommentStickerItemProgram>,
) {
  const id = item.style?.id ?? STYLE_ID;
  const recipe = { contract: "svml.svs-recipe@1", path: `comment-sticker.${id}`, properties } as SvsRecipe;
  return decodeCommentStickerStyle(recipe, carriedStack(item), id);
}

export const commentStickerRecipeFacet: RecipeFacet = {
  surface: "style",
  schema: commentStickerRecipeSchema,
  apply: (properties, current) => {
    const program = asProgram(current["program"]);
    const items: readonly Partial<CommentStickerItemProgram>[] =
      Array.isArray(program.items) ? program.items : [];
    // A Style belongs to an item, so with no item there is nowhere to put one
    // and no face to render it with. Lowering anyway names what is missing here
    // instead of handing the Producer a program that fails deeper in.
    if (items.length === 0) styleFor(properties, {});
    return {
      program: {
        ...program,
        items: items.map((item) => ({ ...item, style: styleFor(properties, item) })),
      } as unknown as CanonicalValue,
    };
  },
};
