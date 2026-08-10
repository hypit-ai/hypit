import type { CanonicalValue, ValueSchema } from "@narratage/protocol";

import { textStyleSchema } from "./manifest.js";
import { REQUIRED_STYLE_PROPERTIES, STYLE_PROPERTIES, spelledStyleProperties } from "./surface.js";
import type { TextStyle } from "./types.js";

/**
 * The properties an author writes in a Text Recipe.
 *
 * `typographyTextStyle` decides what a Recipe may contain in the shape of
 * control flow: a reader call per property, the result cast to whichever field
 * of a TextStyle it fills. That is enough to seal a TextStyle and not enough for
 * anything else to offer a Recipe, so the same facts are stated here as data.
 *
 * Neither half is restated. Which properties exist comes from the reader's own
 * guard set, and what each one accepts comes from the field the value lands in,
 * so an enum widened or a bound moved in the Text Style schema is answered here
 * without anyone remembering to. All that is said below is where each written
 * word goes, and a word going nowhere fails at load rather than quietly becoming
 * untypeable.
 */

/** The TextStyle field each property fills, as `typographyTextStyle` fills it. */
const FIELDS: Readonly<Record<string, readonly string[]>> = {
  "stack-order": ["stackingOrder"],
  "size": ["typography", "sizePx"],
  "weight": ["typography", "weight"],
  "font-style": ["typography", "style"],
  "line-height": ["typography", "lineHeight"],
  "tracking": ["typography", "trackingPx"],
  "word-spacing": ["typography", "wordSpacingPx"],
  "kerning": ["typography", "kerning"],
  "synthesis": ["typography", "synthesis"],
  "language": ["typography", "language"],
  "direction": ["typography", "direction"],
  "writing-mode": ["typography", "writingMode"],
  "baseline-shift": ["typography", "baselineShiftPx"],
  "vertical-align": ["typography", "verticalAlign"],
  "tab-size": ["typography", "tabSize"],
  "indent": ["typography", "indentationPx"],
  "paragraph-before": ["typography", "paragraphBeforePx"],
  "paragraph-after": ["typography", "paragraphAfterPx"],
  "transform": ["typography", "transform"],
  "caps": ["typography", "variantCaps"],
  "cjk-spacing": ["typography", "cjk", "textSpacing"],
  "punctuation-trim": ["typography", "cjk", "punctuationTrim"],
  "inline-size": ["area", "inlineSize"],
  "block-size": ["area", "blockSize"],
  "align": ["area", "inlineAlign"],
  "block-align": ["area", "blockAlign"],
  "wrap": ["area", "wrap"],
  "overflow": ["area", "overflow"],
  "max-lines": ["area", "maxLines"],
  "minimum-scale": ["area", "minimumScale"],
  "clip": ["area", "clipToFrame"],
  "columns": ["area", "columns"],
  "column-gap": ["area", "columnGapPx"],
  "metric-edge": ["area", "metricEdge"],
  "point-anchor-inline": ["point", "anchorInline"],
  "point-anchor-block": ["point", "anchorBlock"],
  "path-side": ["path", "side"],
  "path-orientation": ["path", "orientation"],
  "path-start-margin": ["path", "startMarginPx"],
  "path-end-margin": ["path", "endMarginPx"],
  "path-align": ["path", "align"],
  "path-reverse": ["path", "reverse"],
  "path-overflow": ["path", "overflow"],
};

/**
 * The two a TextStyle keeps in a shape nobody writes: paint is an ordered stack
 * of layers, of which a Recipe names only the solid glyph fill, and padding is
 * four named edges, which an author writes as one, two or four pixel counts.
 * The colour format is what an editor should offer, not the rule the module
 * holds a colour to; that rule forbids `url()` and takes any safe CSS colour.
 */
const WRITTEN: Readonly<Record<string, ValueSchema>> = {
  "fill": { kind: "string", format: "color" },
  "padding": { kind: "string" },
};

function fieldSchema(path: readonly string[]): ValueSchema | undefined {
  let schema: ValueSchema = textStyleSchema;
  for (const step of path) {
    if (schema.kind !== "object") return undefined;
    const field = schema.fields[step];
    if (field === undefined) return undefined;
    schema = field.schema;
  }
  return schema;
}

/** What a property accepts, taken from wherever its value ends up. */
function schemaFor(name: string): ValueSchema | undefined {
  const path = FIELDS[name];
  return path === undefined ? WRITTEN[name] : fieldSchema(path);
}

function fields(): Record<string, { schema: ValueSchema; optional?: true }> {
  const built: Record<string, { schema: ValueSchema; optional?: true }> = {};
  for (const name of [...STYLE_PROPERTIES].sort()) {
    const schema = schemaFor(name);
    if (schema === undefined) throw new Error(`Text Recipe property ${name} has no declared type`);
    built[name] = REQUIRED_STYLE_PROPERTIES.has(name) ? { schema } : { schema, optional: true };
  }
  return built;
}

export const typographyRecipeSchema: ValueSchema = { kind: "object", fields: fields() };

/** Every property name the schema states, for callers that need the set. */
export const typographyRecipeProperties: readonly string[] =
  Object.keys((typographyRecipeSchema as { fields: object }).fields).sort();

function valueAt(style: TextStyle, path: readonly string[]): CanonicalValue | undefined {
  let value: unknown = style;
  for (const step of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[step];
  }
  return value as CanonicalValue | undefined;
}

/**
 * A lowered Style read back as the Recipe that would produce it.
 *
 * The answers are taken from the Style the reader built rather than stated
 * again, using the same map of where each written word lands, so what an editor
 * shows for a property nobody wrote is what the lowering used for it. Two are
 * read from `spelledStyleProperties` instead, being the two the reader puts
 * somewhere no author writes.
 *
 * Four properties can have no answer, and are then left out rather than given
 * one. A language, a line limit and a shrink floor under an overflow that does
 * not shrink are absent from a lowered Style rather than defaulted to anything,
 * so there is no value to report; and the glyph fill of a Recipe that names no
 * colour is whichever one the Item being restyled arrived carrying, which a
 * Recipe on its own cannot see. Saying a colour there would be inventing the
 * one thing an author would most take at its word.
 */
export function typographyStyleProperties(style: TextStyle): Readonly<Record<string, CanonicalValue>> {
  const spelled = spelledStyleProperties(style);
  const reported: Record<string, CanonicalValue> = {};
  for (const name of typographyRecipeProperties) {
    const path = FIELDS[name];
    const value = path === undefined ? spelled[name] : valueAt(style, path);
    if (value !== undefined) reported[name] = value;
  }
  return reported;
}
