import { temporalContextAttributeVocabulary } from "@hypit/temporal-markup";
import { readFile } from "node:fs/promises";

import { narrativeDependency } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { semanticTrackDependency } from "@hypit/semantic-track";
import {
  compositionDependency,
  compositionTypes,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextSequenceSchema,
  visualTextTypographySchema,
} from "@hypit/composition";
import {
  spatialDependency,
  spatialFrameSchema,
  spatialPathSchema,
  spatialPointSchema,
  spatialTypes,
} from "@hypit/spatial";
import { VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@hypit/visual-ir";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { svsRecipeType } from "@hypit/svs";
import { textDependency, textTypes } from "@hypit/text";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { temporalWindowAttributeVocabulary } from "@hypit/temporal-markup";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const typographyTrackModuleRef = { name: "@hypit/typography-track", version: "1" } as const;
export const typographyTrackTypes = {
  style: { module: typographyTrackModuleRef, name: "TextStyle" },
  motion: { module: typographyTrackModuleRef, name: "TextMotion" },
  placement: { module: typographyTrackModuleRef, name: "TextPlacement" },
  program: { module: typographyTrackModuleRef, name: "TypographyTrackProgram" },
  header: { module: typographyTrackModuleRef, name: "TypographyTrackHeader" },
  itemSpec: { module: typographyTrackModuleRef, name: "TextItemSpec" },
  plainItemSpec: { module: typographyTrackModuleRef, name: "PlainTextItemSpec" },
  set: { module: typographyTrackModuleRef, name: "TypographyTrackSet" },
  maskSpec: { module: typographyTrackModuleRef, name: "TextMaskSpec" },
} satisfies Record<string, TypeRef>;

export const typographyTrackProducers = {
  bindPoint: { module: typographyTrackModuleRef, name: "bind-point-placement" },
  bindArea: { module: typographyTrackModuleRef, name: "bind-area-placement" },
  bindPath: { module: typographyTrackModuleRef, name: "bind-path-placement" },
  createSet: { module: typographyTrackModuleRef, name: "create-typography-track-set" },
  appendItem: { module: typographyTrackModuleRef, name: "append-text-item" },
  finalize: { module: typographyTrackModuleRef, name: "finalize-typography-track" },
  render: { module: typographyTrackModuleRef, name: "render-typography-track" },
  renderMask: { module: typographyTrackModuleRef, name: "render-text-mask-track" },
  materializePlainItem: { module: typographyTrackModuleRef, name: "materialize-plain-text-item" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const signedInteger = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });

const styleDeclaration: ValueSchema = { kind: "oneOf", variants: VISUAL_STYLE_NAMES_V1.map((name) => object({
  name: { schema: { kind: "literal", value: name } },
  value: { schema: Object.hasOwn(VISUAL_STYLE_ENUM_VALUES_V1, name)
    ? { kind: "string", enum: VISUAL_STYLE_ENUM_VALUES_V1[name as keyof typeof VISUAL_STYLE_ENUM_VALUES_V1] }
    : { kind: "oneOf", variants: [{ kind: "string" }, { kind: "number" }] } },
})) };
const visualKeyframe = object({
  atFrame: { schema: integer },
  easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true },
  style: { schema: { kind: "array", minItems: 1, items: styleDeclaration } },
});
const visualAnimation = object({ keyframes: { schema: { kind: "array", minItems: 2, items: visualKeyframe } } });

const areaFlow = (() => {
  const schema = visualTextFlowSchema;
  if (schema.kind !== "object") throw new Error("Visual Text flow schema must be an object.");
  const { form: _form, ...fields } = schema.fields;
  return object(fields);
})();

export const textStyleSchema: ValueSchema = object({

  id: { schema: string }, stackingOrder: { schema: signedInteger },
  typography: { schema: visualTextTypographySchema },
  paints: { schema: { kind: "array", items: visualTextPaintSchema } },
  area: { schema: areaFlow },
  point: { schema: object({ anchorInline: { schema: enumString(["start", "center", "end"]) }, anchorBlock: { schema: enumString(["start", "center", "end"]) } }) },
  path: { schema: object({
    side: { schema: enumString(["left", "right"]) }, orientation: { schema: enumString(["follow", "upright"]) },
    startMarginPx: { schema: { kind: "number", minimum: 0 } }, endMarginPx: { schema: { kind: "number", minimum: 0 } },
    align: { schema: enumString(["start", "center", "end"]) }, reverse: { schema: { kind: "boolean" } },
    overflow: { schema: enumString(["visible", "clip"]) },
  }) },
});

export const textMotionSchema: ValueSchema = object({
  id: { schema: string },
  item: { schema: visualAnimation, optional: true },
  sequences: { schema: { kind: "array", items: visualTextSequenceSchema } },
  pathMargin: { schema: object({ keyframes: { schema: { kind: "array", minItems: 2, items: object({
    atFrame: { schema: integer }, startMarginPx: { schema: { kind: "number", minimum: 0 } },
    easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true },
  }) } } }), optional: true },
});

const geometry: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "point" } }, point: { schema: spatialPointSchema } }),
  object({ kind: { schema: { kind: "literal", value: "area" } }, frame: { schema: spatialFrameSchema } }),
  object({ kind: { schema: { kind: "literal", value: "path" } }, path: { schema: spatialPathSchema } }),
] };
export const textPlacementSchema: ValueSchema = object({
  geometry: { schema: geometry },
});
export const textItemSpecSchema: ValueSchema = object({
  id: { schema: string },
  document: { schema: visualTextDocumentSchema },
});
export const plainTextItemSpecSchema: ValueSchema = object({
  id: { schema: string },
});
const span = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: positiveInteger } });
const item = object({
  id: { schema: string }, span: { schema: span }, geometry: { schema: geometry },
  document: { schema: visualTextDocumentSchema }, style: { schema: textStyleSchema }, motion: { schema: textMotionSchema },
  tieBreak: { schema: string },
});
export const typographyTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});
const typographyTrackHeaderSchema = object({ id: { schema: string } });
const typographyTrackSetSchema = object({ items: { schema: { kind: "array", items: item } } });
const textMaskSpecSchema = object({

  id: { schema: string }, mode: { schema: enumString(["alpha", "luminance"]) },
  materialFit: { schema: enumString(["contain", "cover", "fill"]) },
});


/** The document an item owns, written the same way inside a Point, an Area or a Path. */
const documentChildren = [
  { tag: "P", cardinality: "many",
    summary: "One paragraph of the item's document. It holds direct text, Span runs and Break line breaks in the order they are written, and can be drawn in a Style of its own.",
    attributes: [
      { name: "id", kind: "identifier", required: false, summary: "Names this paragraph inside the document; an omitted id is generated from the paragraph's position." },
      { name: "style", kind: "reference", required: false, accepts: [typographyTrackTypes.style], summary: "Redraws the whole paragraph in another compiled Style, whose typography and Paint replace the item's: the paragraph is shaped with that Style's exact font and set at its size, weight and slant, and painted in its fills, outlines, glows, shadows, boxes and decorations. That Style's area, point, path and stacking-order properties are ignored here." },
    ],
    text: "Direct text between the nested elements is one run of the paragraph, drawn in the paragraph's own Style.",
    children: [
      { tag: "Span", cardinality: "many",
        summary: "One run of the paragraph set apart from its neighbours, drawn in a Style, shaped under a language or laid out in a writing direction of its own.",
        attributes: [
          { name: "id", kind: "identifier", required: false, summary: "Names this run inside the paragraph; an omitted id is generated from the run's position." },
          { name: "style", kind: "reference", required: false, accepts: [typographyTrackTypes.style], summary: "Redraws this run alone in another compiled Style, whose typography and Paint replace the paragraph's: the run is shaped with that Style's exact font and set at its size, weight and slant, and painted in its fills, outlines, glows, shadows, boxes and decorations. That Style's area, point, path and stacking-order properties are ignored here." },
          { name: "language", kind: "literal", required: false, summary: "Names the language tag this run alone is shaped under." },
          { name: "direction", kind: "literal", required: false, values: ["auto", "ltr", "rtl"], summary: "Decides the base writing direction of this run alone." },
        ],
        text: "Direct text is the run's whole content; a Span carries no nested elements and cannot be empty." },
      { tag: "Break", cardinality: "many",
        summary: "Breaks the line at this point and continues the same paragraph on the next one. It is written empty and takes no attributes." },
    ] },
] as const;

export const typographyTrackMarkupSurfaces = [
    { name: "style", tag: "Style", mode: "structured", outputs: [typographyTrackTypes.style],
      vocabulary: {
        summary: "One named TextStyle: the typography and layout properties of an SVS Recipe, the exact font bytes text is shaped with, and the ordered Paint the glyphs are drawn in.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Style, under which items and Spans reference it." },
          { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
            summary: "Chooses the Recipe that states the typography, area, point and path properties of this Style.",
            recipe: [
              { name: "stack-order", required: true,
                summary: "Fixes where the text drawn in this Style sits in the Track's paint order." },
              { name: "size", required: true,
                summary: "Sets the type size in pixels, which must be positive." },
              { name: "weight", required: false, fallback: "400",
                summary: "Sets the font weight, as a whole number from 1 to 1000." },
              { name: "font-style", required: false, fallback: "normal", values: ["normal", "italic", "oblique"],
                summary: "Chooses the upright or slanted face." },
              { name: "line-height", required: false, fallback: "1.2",
                summary: "Sets the line box height as a multiple of the type size." },
              { name: "tracking", required: false, fallback: "0",
                summary: "Adds this many pixels between every pair of glyphs." },
              { name: "word-spacing", required: false, fallback: "0",
                summary: "Adds this many pixels to every word space." },
              { name: "kerning", required: false, fallback: "auto", values: ["auto", "normal", "none"],
                summary: "Decides whether the font's kerning pairs are applied." },
              { name: "synthesis", required: false, fallback: "none", values: ["none", "weight", "style", "weight-style"],
                summary: "Decides which of weight and slant may be synthesized when no real face carries them." },
              { name: "language", required: false,
                summary: "Names the language tag the text is shaped under." },
              { name: "direction", required: false, fallback: "auto", values: ["auto", "ltr", "rtl"],
                summary: "Decides the base writing direction of the text." },
              { name: "writing-mode", required: false, fallback: "horizontal-tb", values: ["horizontal-tb", "vertical-rl", "vertical-lr"],
                summary: "Decides whether lines run across the page or down it." },
              { name: "baseline-shift", required: false, fallback: "0",
                summary: "Raises or lowers the glyphs off their baseline, in pixels." },
              { name: "vertical-align", required: false, fallback: "baseline", values: ["baseline", "super", "sub"],
                summary: "Places the glyphs on the baseline or as superscript or subscript." },
              { name: "tab-size", required: false, fallback: "4",
                summary: "Sets how many spaces one tab advances, as a positive whole number." },
              { name: "indent", required: false, fallback: "0",
                summary: "Indents the first line of every paragraph, in pixels." },
              { name: "paragraph-before", required: false, fallback: "0",
                summary: "Adds this many pixels above every paragraph." },
              { name: "paragraph-after", required: false, fallback: "0",
                summary: "Adds this many pixels below every paragraph." },
              { name: "transform", required: false, fallback: "none", values: ["none", "uppercase", "lowercase", "capitalize"],
                summary: "Recases the text before it is shaped." },
              { name: "caps", required: false, fallback: "normal", values: ["normal", "small-caps", "all-small-caps"],
                summary: "Chooses the small-capital variant the font draws." },
              { name: "cjk-spacing", required: false, fallback: "normal",
                summary: "Decides whether automatic spacing is inserted between CJK and Latin runs, written as `normal` or `none`." },
              { name: "punctuation-trim", required: false, fallback: "none",
                summary: "Decides which CJK punctuation is trimmed at the line edges, written as `none`, `start`, `end`, `adjacent` or `all`." },
              { name: "fill", required: false,
                summary: "Paints one solid glyph fill in this color, ahead of the Paint children." },
              { name: "inline-size", required: false, fallback: "fixed", values: ["hug", "fixed"],
                summary: "Decides whether the text box hugs its content along the inline axis or fills its placement." },
              { name: "block-size", required: false, fallback: "fixed", values: ["hug", "fixed"],
                summary: "Decides whether the text box hugs its content along the block axis or fills its placement." },
              { name: "padding", required: false, fallback: "0",
                summary: "Insets the text from its placement edges, as one, two or four non-negative pixel values written top, right, bottom, left." },
              { name: "align", required: false, fallback: "center", values: ["start", "center", "end", "justify"],
                summary: "Aligns the text along the inline axis." },
              { name: "block-align", required: false, fallback: "center", values: ["start", "center", "end"],
                summary: "Aligns the text along the block axis." },
              { name: "wrap", required: false, fallback: "word", values: ["none", "word", "grapheme"],
                summary: "Decides where a line may break." },
              { name: "overflow", required: false, fallback: "visible", values: ["visible", "clip", "ellipsis", "shrink"],
                summary: "Decides what becomes of text that does not fit its placement." },
              { name: "max-lines", required: false,
                summary: "Caps the number of lines the text occupies, which only an `ellipsis` or `shrink` overflow accepts." },
              { name: "minimum-scale", required: false,
                summary: "Sets the smallest fraction of the type size a `shrink` overflow may reduce the text to, which that overflow requires and no other accepts." },
              { name: "clip", required: false, fallback: "false", values: ["true", "false"],
                summary: "Decides whether the text is clipped to its placement." },
              { name: "columns", required: false, fallback: "1",
                summary: "Divides the text box into this many columns." },
              { name: "column-gap", required: false, fallback: "0",
                summary: "Separates the columns by this many pixels." },
              { name: "metric-edge", required: false, fallback: "line-box", values: ["line-box", "cap-height", "ink"],
                summary: "Chooses which typographic edge the text is measured and aligned by." },
              { name: "point-anchor-inline", required: false, fallback: "center", values: ["start", "center", "end"],
                summary: "Anchors Point text along the inline axis of its Point." },
              { name: "point-anchor-block", required: false, fallback: "center", values: ["start", "center", "end"],
                summary: "Anchors Point text along the block axis of its Point." },
              { name: "path-side", required: false, fallback: "left", values: ["left", "right"],
                summary: "Chooses which side of the Path the glyphs sit on." },
              { name: "path-orientation", required: false, fallback: "follow", values: ["follow", "upright"],
                summary: "Decides whether the glyphs turn with the Path or stay upright." },
              { name: "path-start-margin", required: false, fallback: "0",
                summary: "Starts the text this many pixels along the Path, which must not be negative." },
              { name: "path-end-margin", required: false, fallback: "0",
                summary: "Ends the text this many pixels before the Path does, which must not be negative." },
              { name: "path-align", required: false, fallback: "start", values: ["start", "center", "end"],
                summary: "Aligns the text within the Path between its margins." },
              { name: "path-reverse", required: false, fallback: "false", values: ["true", "false"],
                summary: "Sets the text along the Path in the opposite direction." },
              { name: "path-overflow", required: false, fallback: "visible", values: ["visible", "clip"],
                summary: "Decides whether text longer than the Path is drawn or clipped." },
            ] },
          { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
            summary: "Chooses the exact font bytes text is shaped with, either one face or one ordered stack of faces." },
        ],
        children: [
          { tag: "Fill", cardinality: "many",
            summary: "Fills the glyph interior with a solid color or one gradient child.",
            attributes: [
              { name: "color", kind: "literal", required: false, summary: "Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead." },
            ] },
          { tag: "Stroke", cardinality: "many",
            summary: "Outlines the glyphs at an exact width, inside, centred on or outside the glyph edge.",
            attributes: [
              { name: "color", kind: "literal", required: false, summary: "Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead." },
              { name: "width", kind: "literal", required: true, summary: "Sets the outline width in pixels, which must not be negative." },
              { name: "placement", kind: "literal", required: true, values: ["inside", "center", "outside"], summary: "Decides which side of the glyph edge the outline sits on." },
            ] },
          { tag: "Shadow", cardinality: "many",
            summary: "Casts one offset and blurred shadow behind the glyphs.",
            attributes: [
              { name: "color", kind: "literal", required: false, summary: "Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead." },
              { name: "x", kind: "literal", required: true, summary: "Offsets the shadow horizontally in pixels." },
              { name: "y", kind: "literal", required: true, summary: "Offsets the shadow vertically in pixels." },
              { name: "blur", kind: "literal", required: true, summary: "Blurs the shadow by this many pixels, which must not be negative." },
              { name: "spread", kind: "literal", required: false, summary: "Grows the shadow by this many pixels before it is blurred." },
            ] },
          { tag: "Glow", cardinality: "many",
            summary: "Spreads one blurred glow around the glyphs.",
            attributes: [
              { name: "color", kind: "literal", required: false, summary: "Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead." },
              { name: "blur", kind: "literal", required: true, summary: "Blurs the glow by this many pixels, which must not be negative." },
              { name: "spread", kind: "literal", required: false, summary: "Grows the glow by this many pixels before it is blurred, and must not be negative." },
            ] },
          { tag: "Box", cardinality: "many",
            summary: "Paints a decorated box behind the frame, content, paragraph, line, run, word or grapheme. It accepts its own gradient, BoxShadow and Tail children.",
            attributes: [
              { name: "target", kind: "literal", required: true, values: ["frame", "content", "paragraph", "line", "run", "word", "grapheme"], summary: "Chooses which text box the decoration is drawn behind." },
              { name: "continuity", kind: "literal", required: false, values: ["isolated", "joined"], summary: "Joins adjacent boxes into one shape, which only a line, word or grapheme target allows." },
              { name: "color", kind: "literal", required: false, summary: "Paints the box one solid color; omit it and the box takes a Linear or Radial gradient child instead." },
              { name: "padding", kind: "literal", required: false, summary: "Insets the box from the text it sits behind, as one to four pixel values." },
              { name: "radius", kind: "literal", required: false, summary: "Rounds the box corners, as one to four pixel values." },
              { name: "border-color", kind: "literal", required: false, summary: "Paints the box border." },
              { name: "border-width", kind: "literal", required: false, summary: "Sets the border width, as one to four pixel values." },
              { name: "border-style", kind: "literal", required: false, summary: "Chooses the border style." },
            ] },
          { tag: "Axis", cardinality: "many",
            summary: "Sets one variable-font axis to an exact value.",
            attributes: [
              { name: "tag", kind: "literal", required: true, summary: "Names the four-character variable-font axis." },
              { name: "value", kind: "literal", required: true, summary: "Sets that axis to an exact value." },
            ] },
          { tag: "Feature", cardinality: "many",
            summary: "Turns one OpenType feature on or off.",
            attributes: [
              { name: "tag", kind: "literal", required: true, summary: "Names the four-character OpenType feature." },
              { name: "enabled", kind: "literal", required: true, values: ["true", "false"], summary: "Turns that feature on or off." },
            ] },
          { tag: "Decoration", cardinality: "many",
            summary: "Draws an underline, overline or line-through in its own paint.",
            attributes: [
              { name: "line", kind: "literal", required: true, values: ["underline", "overline", "line-through"], summary: "Chooses which line is drawn." },
              { name: "color", kind: "literal", required: false, summary: "Paints the layer one solid color; omit it and the layer takes a Linear or Radial gradient child instead." },
              { name: "style", kind: "literal", required: false, values: ["solid", "double", "dotted", "dashed", "wavy"], summary: "Chooses the line style; defaults to `solid`." },
              { name: "thickness", kind: "literal", required: false, summary: "Sets the line thickness in pixels, which must not be negative." },
              { name: "offset", kind: "literal", required: false, summary: "Moves the line away from its default position, in pixels." },
              { name: "skip-ink", kind: "literal", required: false, values: ["true", "false"], summary: "Decides whether the line breaks around descenders; defaults to `true`." },
            ] },
        ],
        example: `<text:Style id="poster" recipe={editorial} font={exact-font}>
  <text:Fill color="#f8fafc"/>
  <text:Stroke color="#111827" width="3" placement="outside"/>
  <text:Box target="line" continuity="isolated" color="#2563eb" padding="5 10" radius="8"/>
</text:Style>`,
        notes: [
          "A Style requires at least one `<Fill>` or `<Stroke>`, so that the glyphs are visible; the Paint children paint in the order they are written.",
          "The Recipe is refused when it carries a property name outside the table above.",
          "Every paint states itself as `color` or as one `<Linear angle>` or `<Radial x y>` child, never both; a gradient carries at least two `<Stop>` children, each requiring `offset` and `color` and accepting a normalized `opacity`, written empty and in ascending offset order.",
          "`<Box>` takes `padding`, `radius` and `border-width` as one, two or four non-negative numbers, and draws a border only when `border-color` and a non-zero `border-width` are written together.",
          "`<Box>` accepts `<BoxShadow>` children, which require `color` and accept `x`, `y`, `blur` and `spread`, and one `<Tail>` child, which is written empty and requires `side`, `offset`, `width`, `height` and `color`.",
          "`<Axis>` and `<Feature>` are written empty, and neither repeats a `tag`.",
          "One `<Decoration>` line is declared once.",
          "The TextStyle Record is published under the bare `id`, and the element carries no text content.",
        ],
      },
    },
    { name: "motion", tag: "Motion", mode: "structured", outputs: [typographyTrackTypes.motion],
      vocabulary: {
        summary: "One named TextMotion: the keyframes an item plays as a whole, the Sequences that animate its document units, and the Path start margin over time.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Motion, under which items reference it." },
        ],
        children: [
          { tag: "ItemKeyframe", cardinality: "many",
            summary: "Fixes the transform, opacity, blur, color or clip of the whole item at one frame.",
            attributes: [
              { name: "at", kind: "literal", required: true, summary: "Lands this keyframe on an exact frame of the item's window." },
              { name: "easing", kind: "literal", required: false, summary: "Decides how the value travels into this keyframe." },
              { name: "x", kind: "literal", required: false, summary: "Translates the item horizontally, in pixels." },
              { name: "y", kind: "literal", required: false, summary: "Translates the item vertically, in pixels." },
              { name: "scale", kind: "literal", required: false, summary: "Scales the item uniformly; defaults to `1`." },
              { name: "rotate", kind: "literal", required: false, summary: "Rotates the item, in degrees." },
              { name: "skew-x", kind: "literal", required: false, summary: "Skews the item horizontally, in degrees." },
              { name: "skew-y", kind: "literal", required: false, summary: "Skews the item vertically, in degrees." },
              { name: "opacity", kind: "literal", required: false, summary: "Sets the item's opacity at this keyframe." },
              { name: "blur", kind: "literal", required: false, summary: "Blurs the item by this radius in pixels." },
              { name: "color", kind: "literal", required: false, summary: "Sets the glyph color at this keyframe." },
              { name: "clip-top", kind: "literal", required: false, summary: "Insets the top edge of the reveal rectangle, as a percentage." },
              { name: "clip-right", kind: "literal", required: false, summary: "Insets the right edge of the reveal rectangle, as a percentage." },
              { name: "clip-bottom", kind: "literal", required: false, summary: "Insets the bottom edge of the reveal rectangle, as a percentage." },
              { name: "clip-left", kind: "literal", required: false, summary: "Insets the left edge of the reveal rectangle, as a percentage." },
            ] },
          { tag: "Sequence", cardinality: "many",
            summary: "Animates a range of paragraphs, lines, runs, words or graphemes one after another. It carries its own Keyframe children.",
            attributes: [
              { name: "id", kind: "identifier", required: true, summary: "Names this Sequence inside the Motion." },
              { name: "unit", kind: "literal", required: true, summary: "Chooses the document unit one animation instance covers." },
              { name: "start-index", kind: "literal", required: true, summary: "Fixes the first unit index the Sequence covers." },
              { name: "end-index", kind: "literal", required: true, summary: "Fixes the exclusive last unit index the Sequence covers." },
              { name: "duration-frames", kind: "literal", required: true, summary: "Sets how long one unit's animation lasts." },
              { name: "order", kind: "literal", required: false, summary: "Decides the order the units animate in; defaults to `forward`." },
              { name: "start-frame", kind: "literal", required: false, summary: "Lands the first unit's animation on this frame; defaults to `0`." },
              { name: "stagger-frames", kind: "literal", required: false, summary: "Delays each unit behind the one before it; defaults to `0`." },
              { name: "cycles", kind: "literal", required: false, summary: "Repeats one unit's animation this many times; defaults to `1`." },
              { name: "seed", kind: "literal", required: false, summary: "Fixes the draw a `random` order makes." },
            ] },
          { tag: "PathKeyframe", cardinality: "many",
            summary: "Fixes the start margin of Path text at one frame, moving the text along its Path.",
            attributes: [
              { name: "at", kind: "literal", required: true, summary: "Lands this keyframe on an exact frame of the item's window." },
              { name: "margin", kind: "literal", required: true, summary: "Sets how far along the Path the text begins, in pixels." },
              { name: "easing", kind: "literal", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], summary: "Decides how the margin travels into this keyframe." },
            ] },
        ],
        example: `<text:Motion id="arrive">
  <text:ItemKeyframe at="0" y="24" opacity="0"/>
  <text:ItemKeyframe at="150" y="0" opacity="1"/>
  <text:Sequence id="words" unit="word" start-index="0" end-index="2" duration-frames="12" stagger-frames="3">
    <text:Keyframe at="0" opacity="0"/>
    <text:Keyframe at="1" opacity="1"/>
  </text:Sequence>
</text:Motion>`,
        notes: [
          "An `<ItemKeyframe>` is written empty, and it and a `<Keyframe>` alike must animate at least one of `x`, `y`, `scale`, `rotate`, `skew-x`, `skew-y`, `opacity`, `blur`, `color` or a `clip-` inset.",
          "An item animation and a Path margin animation each need at least two keyframes.",
          "A `<Sequence>` accepts only `<Keyframe>` children and carries at least two of them; a `<Keyframe>` takes the same attributes as an `<ItemKeyframe>`, with `at` read as the progress from 0 to 1 through one unit.",
          "The TextMotion Record is published under the bare `id`, and the element carries no text content.",
        ],
      },
    },
    { name: "track", tag: "Track", mode: "structured", outputs: [typographyTrackTypes.header, typographyTrackTypes.itemSpec, typographyTrackTypes.plainItemSpec, typographyTrackTypes.motion, typographyTrackTypes.set, typographyTrackTypes.placement, temporalTypes.instantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window, typographyTrackTypes.program, compositionTypes.visualTrack],
      vocabulary: {
        summary: "One Typography Track: independently placed and timed text items on a shared ProgramSpace, lowered to one addressable TypographyTrackProgram and one peer VisualTrack.",
        appearance: "Text alone on an otherwise empty Canvas: the glyphs, plus whatever Paint the Style puts around them — fills, outlines, glows, shadows and rounded, bordered, optionally tailed boxes drawn behind the frame, paragraph, line, run, word or grapheme. Each item holds its own region of the Canvas: a Point item is one unwrapped block that hugs its text and hangs off a single coordinate by its inline and block anchors, an Area item flows and wraps inside a rectangle under its own alignment, columns, clipping and overflow, and a Path item strings the glyphs along a curve, on one side of it, turning with it or standing upright. Items switch on and off at their own frame windows and overlap in the stacking order their Styles declare, so titles, labels and captions can occupy different corners at once and outlast or outlive one another. While an item is on screen it plays its Motion: the whole block translating, scaling, rotating, skewing, fading, blurring, recoloring or wiping open from an edge, and its paragraphs, lines, runs, words or graphemes arriving one behind another in a staggered run.",
        preview: previewImage("Track.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Track and prefixes the identity of every item spec it seals." },
          ...temporalContextAttributeVocabulary,
        ],
        children: [
          { tag: "Point", cardinality: "many",
            summary: "One text item anchored at a SpatialPoint. It owns its own document, written as direct text or as P children.",
            attributes: [
              { name: "id", kind: "identifier", required: true, summary: "Names this item and the spec the Track seals for it." },
              { name: "placement", kind: "reference", required: true, accepts: [spatialTypes.point], summary: "Anchors the item at this Point." },
              { name: "style", kind: "reference", required: true, accepts: [typographyTrackTypes.style], summary: "Chooses the compiled Style the item is drawn in." },
              { name: "motion", kind: "reference", required: false, accepts: [typographyTrackTypes.motion], summary: "Chooses the Motion the item plays; the Track supplies a still Motion otherwise." },
              { name: "content", kind: "reference", required: false, accepts: [textTypes.text], summary: "Reads an ordinary graph Text as one plain run, which requires the item to be written empty." },
              ...temporalWindowAttributeVocabulary,
            ],
            children: documentChildren,
            text: "Direct text is the item's whole document, read as one paragraph." },
          { tag: "Area", cardinality: "many",
            summary: "One text item flowed inside a SpatialFrame. It owns its own document, written as direct text or as P children.",
            attributes: [
              { name: "id", kind: "identifier", required: true, summary: "Names this item and the spec the Track seals for it." },
              { name: "placement", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Flows the item inside this Frame." },
              { name: "style", kind: "reference", required: true, accepts: [typographyTrackTypes.style], summary: "Chooses the compiled Style the item is drawn in." },
              { name: "motion", kind: "reference", required: false, accepts: [typographyTrackTypes.motion], summary: "Chooses the Motion the item plays; the Track supplies a still Motion otherwise." },
              { name: "content", kind: "reference", required: false, accepts: [textTypes.text], summary: "Reads an ordinary graph Text as one plain run, which requires the item to be written empty." },
              ...temporalWindowAttributeVocabulary,
            ],
            children: documentChildren,
            text: "Direct text is the item's whole document, read as one paragraph." },
          { tag: "Path", cardinality: "many",
            summary: "One text item set along a SpatialPath. It owns its own document, written as direct text or as P children.",
            attributes: [
              { name: "id", kind: "identifier", required: true, summary: "Names this item and the spec the Track seals for it." },
              { name: "placement", kind: "reference", required: true, accepts: [spatialTypes.path], summary: "Sets the item along this Path." },
              { name: "style", kind: "reference", required: true, accepts: [typographyTrackTypes.style], summary: "Chooses the compiled Style the item is drawn in." },
              { name: "motion", kind: "reference", required: false, accepts: [typographyTrackTypes.motion], summary: "Chooses the Motion the item plays; the Track supplies a still Motion otherwise." },
              { name: "content", kind: "reference", required: false, accepts: [textTypes.text], summary: "Reads an ordinary graph Text as one plain run, which requires the item to be written empty." },
              ...temporalWindowAttributeVocabulary,
            ],
            children: documentChildren,
            text: "Direct text is the item's whole document, read as one paragraph." },
        ],
        ports: [
          { name: "program", type: typographyTrackTypes.program,
            summary: "The sealed TypographyTrackProgram, which a Mask consumes." },
          { name: "track", type: compositionTypes.visualTrack,
            summary: "The rendered text, an ordinary peer VisualTrack." },
        ],
        example: `<text:Track id="titles" semantic={speech.semantic}>
  <text:Area id="title" placement={title-frame} style={title-style} during="program">
    EDIT MEANING, NOT TIMELINES
  </text:Area>
  <text:Area id="standfirst" placement={standfirst-frame} style={body-style} during="program">
    <text:P>Edit meaning,<text:Break/>not <text:Span style={accent-serif}>timelines</text:Span>.</text:P>
  </text:Area>
</text:Track>`,
        notes: [
          "A Track requires at least one `<Point>`, `<Area>` or `<Path>` and accepts no text content of its own.",
          "An item states exactly one window form: `during`, `at` with `for`, `until` with `for`, or `start` with `end`. Bind selection, segment and/or moment only when the start/end expressions use them; different endpoints can use different bindings.",
          "A point expression is `program.start`, `program.end`, `selection.start`, `selection.end`, `segment.start`, `segment.end` or `moment.cue`, each optionally offset by `+` or `-` and a duration, or a bare duration read as an absolute position.",
          "An item written without `content` owns its own document: direct text becomes one paragraph, and `<P>` children carry rich runs instead; a document mixes neither `<P>` children with direct text nor direct text with nested elements.",
          "Neither a `<P>` nor a `<Span>` may be empty, and a `style` on either must name a Style Record authored in this Source or imported from another, because its typography and Paint are copied into the document as the item is decoded.",
        ],
      },
    },
    { name: "mask", tag: "Mask", mode: "structured", outputs: [typographyTrackTypes.maskSpec, compositionTypes.visualTrack],
      vocabulary: {
        summary: "Cuts one owned Surface to the shape of one authored TypographyTrackProgram and publishes the result as a peer VisualTrack.",
        appearance: "The words of the authored Text Program filled with a picture: each item's letterforms are cut out of the material Surface, and every pixel outside the glyphs is transparent. Only the glyph shapes carry across — the Style's own fills, outlines and boxes are not drawn — so what reads on screen is one horizontal line of type per item, set at the padding and inline and block alignment of its Frame, with the material scaled to contain, cover or fill that Frame behind it. Items appear and vanish on the same frames as the Text Program they take their shape from, and each plays that item's whole-item Motion, so the picture-filled type translates, scales, rotates, fades, blurs or wipes as one piece.",
        preview: previewImage("Mask.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Mask, under which its VisualTrack is published." },
          ...temporalContextAttributeVocabulary,
          { name: "text", kind: "reference", required: true, accepts: [typographyTrackTypes.program],
            summary: "Chooses the authored Text Program whose items give the mask its shape and timing." },
          { name: "material", kind: "reference", required: true, accepts: [mediaTypes.compositableSurface],
            summary: "Chooses the Surface shown through the text." },
          { name: "mode", kind: "literal", required: false, values: ["alpha", "luminance"],
            summary: "Whether the text masks by coverage or by brightness; defaults to `alpha`." },
          { name: "fit", kind: "literal", required: false, values: ["contain", "cover", "fill"],
            summary: "How the material occupies each masked item; defaults to `cover`." },
        ],
        ports: [
          { name: "track", type: compositionTypes.visualTrack,
            summary: "The masked picture, an ordinary peer VisualTrack." },
        ],
        example: `<text:Mask id="masked-titles" semantic={speech.semantic} text={mask-shape.program} material={material}/>`,
        notes: [
          "A Mask is written empty and accepts no children.",
          "The material must be a still Surface; a timed material is refused and materializes through an independent package.",
          "Every item of the Text Program must be one Area holding one unstyled paragraph, without Sequence motion, and drawn in a Style that is fixed in both axes, unwrapped, single-column, horizontally written, undecorated, without `ellipsis` or `shrink` overflow, and whose weight and style match its primary exact font without synthesis; anything else is refused.",
        ],
      },
    },
  ] as const;


export const typographyTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: typographyTrackModuleRef.name,
  version: typographyTrackModuleRef.version,
  dependencies: [narrativeDependency, programSpaceDependency, semanticTrackDependency, spatialDependency, mediaDependency, compositionDependency, textDependency, temporalDependency],
  types: [
    { name: typographyTrackTypes.style.name },
    { name: typographyTrackTypes.motion.name },
    { name: typographyTrackTypes.placement.name },
    { name: typographyTrackTypes.program.name },
    { name: typographyTrackTypes.header.name },
    { name: typographyTrackTypes.itemSpec.name },
    { name: typographyTrackTypes.plainItemSpec.name },
    { name: typographyTrackTypes.set.name },
    { name: typographyTrackTypes.maskSpec.name },
  ],
  capabilities: [],
  producers: [
    { name: typographyTrackProducers.materializePlainItem.name, inputs: [{ name: "spec", type: typographyTrackTypes.plainItemSpec }, { name: "content", type: textTypes.text }], outputs: [{ name: "spec", type: typographyTrackTypes.itemSpec }], needs: [] },
    { name: typographyTrackProducers.bindPoint.name, inputs: [{ name: "point", type: spatialTypes.point }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [] },
    { name: typographyTrackProducers.bindArea.name, inputs: [{ name: "frame", type: spatialTypes.frame }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [] },
    { name: typographyTrackProducers.bindPath.name, inputs: [{ name: "path", type: spatialTypes.path }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [] },
    { name: typographyTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [] },
    { name: typographyTrackProducers.appendItem.name, inputs: [{ name: "set", type: typographyTrackTypes.set }, { name: "header", type: typographyTrackTypes.header }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: typographyTrackTypes.placement }, { name: "spec", type: typographyTrackTypes.itemSpec }, { name: "style", type: typographyTrackTypes.style }, { name: "motion", type: typographyTrackTypes.motion }, { name: "window", type: temporalTypes.window }], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [] },
    { name: typographyTrackProducers.finalize.name, inputs: [{ name: "header", type: typographyTrackTypes.header }, { name: "set", type: typographyTrackTypes.set }], outputs: [{ name: "program", type: typographyTrackTypes.program }], needs: [] },
    { name: typographyTrackProducers.render.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: typographyTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
    { name: typographyTrackProducers.renderMask.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: typographyTrackTypes.program }, { name: "material", type: mediaTypes.compositableSurface }, { name: "spec", type: typographyTrackTypes.maskSpec }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};
