import type { RecipeFacet } from "@narratage/component-kit";
import type { FontArtifactRef, FontStackRef } from "@narratage/media";
import type { CanonicalValue, ValueSchema } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import {
  columnRecipeSchema,
  tierBoardRecipeSchema,
  topThreeRecipeSchema,
  typewriterListRecipeSchema,
} from "./recipe-schema.js";
import {
  decodeColumnStyle,
  decodeTierBoardStyle,
  decodeTopThreeStyle,
  decodeTypewriterListStyle,
} from "./style.js";
import type { RankingSoundStyle } from "./types.js";

/**
 * Writing a Ranking Recipe, without a stylesheet around it.
 *
 * The Style Surfaces reach the same four decoders from an authored element;
 * these reach them from loose properties, so an editor can show what a Recipe
 * does before there is a `.svs` to put it in. The lowering is shared rather
 * than repeated, which is what keeps the preview honest.
 *
 * A Recipe answers for the Style and nothing else. The Schedule, the frame,
 * the Items with their icons and the typewriter title are a Build's to supply,
 * so they are carried through as they came.
 *
 * The four are listed in the order their Surfaces are declared, because a host
 * that offers one Recipe per Producer has no way yet to say which of the four
 * it means.
 */

/** Where a Program keeps the faces it already renders with. */
type StyleFaces = {
  readonly text?: { readonly fonts?: readonly FontArtifactRef[] };
  readonly title?: { readonly fonts?: readonly FontArtifactRef[] };
};

function asProgram(value: CanonicalValue | undefined): Record<string, CanonicalValue> {
  return value !== null && typeof value === "object" ? value as Record<string, CanonicalValue> : {};
}

/**
 * Faces already in hand.
 *
 * A Recipe names a font; it does not carry one. Whatever faces the Program
 * renders with stay chosen, and when there are none the decoder says so in its
 * own words rather than this inventing a digest to get past its validator.
 *
 * A typewriter list sets its title and its items apart, but the decoder takes
 * one font for both, so applying a Recipe to a Program whose two differ leaves
 * them the same.
 */
function carriedFaces(program: Record<string, CanonicalValue>, from: "text" | "title"): FontStackRef {
  const fonts = (program["style"] as unknown as StyleFaces | undefined)?.[from]?.fonts;
  return { contract: "svml.font-stack@1", faces: Array.isArray(fonts) ? fonts : [] };
}

function facet(
  surface: string,
  schema: ValueSchema,
  from: "text" | "title",
  decode: (recipe: SvsRecipe, font: FontStackRef) => {
    readonly style: unknown;
    readonly sound: RankingSoundStyle;
  },
): RecipeFacet {
  return {
    surface,
    schema,
    apply: (properties, current) => {
      const program = asProgram(current["program"]);
      // The same Recipe also states how loud the Ranking sounds, and that half
      // is read by the audio Producer, which takes a Style of its own. The
      // render Producers reached here are given a Program and never see it.
      const { style } = decode(
        { contract: "svml.svs-recipe@1", path: `ranking.${surface}`, properties },
        carriedFaces(program, from),
      );
      return { program: { ...program, style } as unknown as CanonicalValue };
    },
  };
}

export const tierBoardRecipeFacet = facet("tier-style", tierBoardRecipeSchema, "text", decodeTierBoardStyle);
export const columnRecipeFacet = facet("column-style", columnRecipeSchema, "text", decodeColumnStyle);
export const topThreeRecipeFacet = facet("top-three-style", topThreeRecipeSchema, "text", decodeTopThreeStyle);
export const typewriterListRecipeFacet =
  facet("typewriter-style", typewriterListRecipeSchema, "title", decodeTypewriterListStyle);

export const rankingRecipeFacets: readonly RecipeFacet[] = [
  tierBoardRecipeFacet, columnRecipeFacet, topThreeRecipeFacet, typewriterListRecipeFacet,
];
