import type { CaptionProgram } from "@narratage/caption";
import type { RecipeFacet } from "@narratage/component-kit";
import type { FontArtifactRef } from "@narratage/media";
import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import { fineCaptionEffective } from "./recipe-effective.js";
import { fineCaptionRecipeSchema } from "./recipe-schema.js";
import { REQUIRED_PROPERTIES, fineCaptionStyle } from "./style.js";

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

/**
 * A legible caption on a vertical frame.
 *
 * Stated rather than derived, because a starting point is a judgement and the
 * decoder holds none: it requires these fifteen and says nothing about what
 * good values are. Their being exactly the required set is checked at load, so
 * a new requirement cannot leave this behind.
 */
export const fineCaptionDefaultRecipe: Readonly<Record<string, CanonicalValue>> = {
  "align": "center",
  "background": "#09090BCC",
  "cue-max-words": 5,
  "cue-min-words": 2,
  "fill": "#FFFFFF",
  "font": "Inter",
  "line-height": 0.96,
  "padding": "16 24",
  "radius": 18,
  "size": 58,
  "stack-order": 70,
  "weight": 600,
  "width": 0.84,
  "x": 0.08,
  "y": 0.76,
};

const stated = Object.keys(fineCaptionDefaultRecipe).sort().join(" ");
const demanded = [...REQUIRED_PROPERTIES].sort().join(" ");
if (stated !== demanded) {
  throw new Error("Fine Caption default Recipe must state exactly the required properties");
}

export const fineCaptionRecipeFacet: RecipeFacet = {
  surface: "style",
  schema: fineCaptionRecipeSchema,
  defaults: fineCaptionDefaultRecipe,
  effective: (properties) => fineCaptionEffective({ ...fineCaptionDefaultRecipe, ...properties }),
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
