import type { CaptionProgram } from "@narratage/caption";
import type { RecipeFacet } from "@narratage/component-kit";
import type { FontArtifactRef } from "@narratage/media";
import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import { fineCaptionRecipeSchema } from "./recipe-schema.js";
import { fineCaptionStyle } from "./style.js";

/**
 * Writing a Fine Caption Recipe, without a stylesheet around it.
 *
 * The Surface reaches the same `fineCaptionStyle` from an authored element; this
 * reaches it from loose properties, so an editor can show what a Recipe does
 * before there is a `.svml` to put it in. The lowering is shared rather than
 * repeated, which is what keeps the preview honest.
 */

const STYLE_ID = "preview";

function asProgram(value: CanonicalValue | undefined): Partial<CaptionProgram> {
  return value !== null && typeof value === "object" ? value as Partial<CaptionProgram> : {};
}

/**
 * Faces already in hand.
 *
 * A Recipe names a font; it does not carry one. Whatever face the caller has
 * chosen stays chosen, and when there is none `fineCaptionStyle` says so in its
 * own words rather than this inventing a digest to get past it.
 */
function carriedFonts(program: Partial<CaptionProgram>): readonly FontArtifactRef[] {
  const styles = Array.isArray(program.styles) ? program.styles : [];
  const fonts = styles[0]?.rendering.parameters.typography.exactFonts;
  return Array.isArray(fonts) ? fonts : [];
}

export const fineCaptionRecipeFacet: RecipeFacet = {
  surface: "style",
  schema: fineCaptionRecipeSchema,
  apply: (properties, current) => {
    const program = asProgram(current["program"]);
    const style = fineCaptionStyle(
      STYLE_ID,
      { contract: "svml.svs-recipe@1", path: `caption.${STYLE_ID}`, properties } as SvsRecipe,
      carriedFonts(program),
    );
    // Runs name a Style by id and this replaces the only one, so they are
    // pointed at it rather than left referring to something now absent.
    const runs = (Array.isArray(program.runs) ? program.runs : [])
      .map((run) => ({ ...run, styleId: STYLE_ID }));
    return {
      program: {
        ...program, styles: [style], defaultStyleId: STYLE_ID, runs,
      } as unknown as CanonicalValue,
    };
  },
};
