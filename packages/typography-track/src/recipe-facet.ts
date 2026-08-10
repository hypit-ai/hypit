import type { RecipeFacet } from "@narratage/component-kit";
import type { FontArtifactRef } from "@narratage/media";
import type { CanonicalValue } from "@narratage/protocol";
import type { SvsRecipe } from "@narratage/svs";

import { sealTypographyTrackProgram } from "./program.js";
import { typographyRecipeSchema } from "./recipe-schema.js";
import { typographyTextStyle } from "./surface.js";
import type { TextStyleChildren } from "./surface.js";
import type { TextItem, TextStyle, TypographyTrackProgram } from "./types.js";

/**
 * Writing a Text Recipe, without a stylesheet around it.
 *
 * The Style Surface reaches `typographyTextStyle` from an authored element; this
 * reaches it from loose properties, so an editor can show what a Recipe does
 * before there is a `.svml` to put it in. The lowering is shared rather than
 * repeated, which is what keeps the preview honest.
 *
 * Both Producers that emit a VisualTrack read the same `program`, so restyling
 * its Items serves the plain track and the text mask alike.
 */

const STYLE_ID = "preview";

const LABEL = "Text Recipe";

function asProgram(value: CanonicalValue | undefined): Partial<TypographyTrackProgram> {
  return value !== null && typeof value === "object" ? value as Partial<TypographyTrackProgram> : {};
}

/**
 * Faces already in hand.
 *
 * A Recipe names no font at all, so whatever faces an Item was built with stay
 * its own rather than the first Item's — a program set in two typefaces is not
 * flattened by being previewed. When an Item has none, `typographyTextStyle`
 * says so in its own words rather than this inventing a digest to get past it.
 */
function carriedFonts(style: Partial<TextStyle> | undefined): readonly FontArtifactRef[] {
  const fonts = style?.typography?.fonts;
  return Array.isArray(fonts) ? fonts : [];
}

/**
 * The rest of what a Style was authored with.
 *
 * Stroke, Shadow, Glow and Box layers, axes, features and Decorations were
 * written as children of a Style element and no Recipe property reaches them, so
 * they stay. The one layer a Recipe does name is the solid glyph fill, which
 * therefore gives way to the written one instead of accumulating beside it.
 */
function carriedChildren(style: Partial<TextStyle> | undefined, fill: boolean): TextStyleChildren {
  const paints = style?.paints ?? [];
  return {
    paints: fill ? paints.filter((paint) => paint.kind !== "fill") : paints,
    axes: style?.typography?.axes ?? [],
    features: style?.typography?.features ?? [],
    decorations: style?.typography?.decorations ?? [],
  };
}

export const typographyRecipeFacet: RecipeFacet = {
  surface: "style",
  schema: typographyRecipeSchema,
  apply: (properties, current) => {
    const program = asProgram(current["program"]);
    const recipe = {
      contract: "svml.svs-recipe@1", path: `text.${STYLE_ID}`, properties,
    } as SvsRecipe;
    // Every Item embeds a whole Style rather than naming a shared one, so a
    // Recipe is written into each; the id it was authored under is the Item's
    // own and outlives being restyled.
    const items = (Array.isArray(program.items) ? program.items : [])
      .map((item: Partial<TextItem>) => ({
        ...item,
        style: typographyTextStyle(
          item.style?.id ?? STYLE_ID, recipe, carriedFonts(item.style), LABEL,
          carriedChildren(item.style, properties.fill !== undefined),
        ),
      }));
    // Items are held in one canonical order and stack-order is part of it, so a
    // Recipe that moves one leaves the program to be sealed again.
    return {
      program: sealTypographyTrackProgram(
        { ...program, items } as TypographyTrackProgram,
      ) as unknown as CanonicalValue,
    };
  },
};
