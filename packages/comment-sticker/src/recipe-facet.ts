import type { RecipeFacet } from "@narratage/component-kit";
import type { FontStackRef } from "@narratage/media";
import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import { decodeCommentStickerStyle } from "./author.js";
import { commentStickerRecipeProperties, commentStickerRecipeSchema } from "./recipe-schema.js";
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

/** How the sticker arrives, waits and leaves, as opposed to what it looks like standing still. */
function motion(name: string): boolean {
  return /^(?:enter|exit|hold)(?:-|$)/u.test(name);
}

/**
 * Nothing, because a Comment Sticker requires nothing.
 *
 * Every property here has a fallback, so the empty Recipe is both legal and
 * already the sticker this module draws. Repeating those fallbacks would show
 * an operator fifty-one filled fields describing what absence describes
 * anyway — and freeze values the decoder is still free to revise.
 */
export const commentStickerDefaultRecipe: Readonly<Record<string, CanonicalValue>> = {};

// Nothing is required today because every property has a fallback. Should one
// lose its fallback, absence would stop being a deferral and start being a
// hole, and this says so before a form opens on it.
const fields = (commentStickerRecipeSchema as { fields: Record<string, { optional?: true }> }).fields;
const unstated = Object.keys(fields)
  .filter((name) => fields[name]?.optional !== true && !Object.hasOwn(commentStickerDefaultRecipe, name));
if (unstated.length > 0) {
  throw new Error(`Comment Sticker default Recipe leaves required ${unstated.join(", ")} unset`);
}

export const commentStickerRecipeFacet: RecipeFacet = {
  surface: "style",
  schema: commentStickerRecipeSchema,
  defaults: commentStickerDefaultRecipe,
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
