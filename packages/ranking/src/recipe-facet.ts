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
  COLUMN_PROPERTIES,
  TIER_BOARD_PROPERTIES,
  TOP_THREE_PROPERTIES,
  TYPEWRITER_LIST_PROPERTIES,
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

/**
 * A starting point, for a tool that has to open on something.
 *
 * Every reader in `style.ts` takes a fallback, so no property here is required
 * and a Recipe naming all thirty-odd would be one no author has ever written.
 * These state the decisions the decoders cannot make on their own — what the
 * rows are, what the palette is, and the paint a variant shares with the others
 * but cannot wear — and leave geometry and motion to the fallbacks, which are
 * already tuned. What is checked at load is that every stated property is one
 * its variant honours, so a property renamed out of a decoder cannot leave a
 * default behind that quietly does nothing.
 */
function stating(
  variant: string,
  properties: readonly string[],
  stated: Readonly<Record<string, CanonicalValue>>,
): Readonly<Record<string, CanonicalValue>> {
  const honoured = new Set(properties);
  const stray = Object.keys(stated).filter((name) => !honoured.has(name));
  if (stray.length > 0) {
    throw new Error(`Ranking ${variant} default Recipe states ${stray.join(", ")}, which it does not honour`);
  }
  return stated;
}

/** A board dark enough to carry white type over whatever video is behind it. */
const PAINTED_BOARD = {
  "board-background": "#111827",
  "board-border-color": "#FFFFFF29",
  "board-radius": 20,
} as const;

/** Type that stays readable while the rows beneath it are still moving. */
const BOARD_TYPE = {
  "font-size": 30,
  "font-weight": 700,
  "text-color": "#F8FAFC",
  "line-height": 1.2,
} as const;

/** Four tiers on a warm-to-cool ramp, the shape a viewer already expects. */
export const tierBoardDefaultRecipe = stating("Tier Board", TIER_BOARD_PROPERTIES, {});

/** Gold, silver and bronze, then two colours that stay quiet behind them. */
export const columnDefaultRecipe = stating("Column", COLUMN_PROPERTIES, {});

/**
 * Three slots with no board under them.
 *
 * Names drawn straight onto the frame have only their own weight to hold them
 * apart from the picture, so they are heavier here than on a board.
 */
export const topThreeDefaultRecipe = stating("Top Three", TOP_THREE_PROPERTIES, {});

/**
 * Paper, because the shared board fallback is not.
 *
 * A typewriter list reads its board through the same `board-background` as the
 * dark variants, and its own ink falls back to near-black, so the two fallbacks
 * meet as dark on dark. Stating the paper is what makes the ink legible, and
 * once it is stated the ink needs nothing said about it. The winner's star is
 * the exception: its yellow was chosen against a dark board and disappears here.
 */
export const typewriterListDefaultRecipe = stating("Typewriter List", TYPEWRITER_LIST_PROPERTIES, {});

function facet(
  surface: string,
  schema: ValueSchema,
  defaults: Readonly<Record<string, CanonicalValue>>,
  from: "text" | "title",
  decode: (recipe: SvsRecipe, font: FontStackRef) => {
    readonly style: unknown;
    readonly sound: RankingSoundStyle;
  },
): RecipeFacet {
  return {
    surface,
    schema,
    defaults,
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

export const tierBoardRecipeFacet =
  facet("tier-style", tierBoardRecipeSchema, tierBoardDefaultRecipe, "text", decodeTierBoardStyle);
export const columnRecipeFacet =
  facet("column-style", columnRecipeSchema, columnDefaultRecipe, "text", decodeColumnStyle);
export const topThreeRecipeFacet =
  facet("top-three-style", topThreeRecipeSchema, topThreeDefaultRecipe, "text", decodeTopThreeStyle);
export const typewriterListRecipeFacet = facet(
  "typewriter-style", typewriterListRecipeSchema, typewriterListDefaultRecipe, "title", decodeTypewriterListStyle,
);

export const rankingRecipeFacets: readonly RecipeFacet[] = [
  tierBoardRecipeFacet, columnRecipeFacet, topThreeRecipeFacet, typewriterListRecipeFacet,
];
