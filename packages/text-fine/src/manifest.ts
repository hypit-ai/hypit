import { timelineTypes, timelineDependency } from "@hypit/timeline";
import { readFile } from "node:fs/promises";

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
import { VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@hypit/composition";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { recipeType } from "@hypit/hypit/recipe";
import { textDependency, textTypes } from "@hypit/hypit/text";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { temporalWindowAttributeVocabulary } from "@hypit/temporal/markup";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const textFineModuleRef = { name: "@hypit/text-fine", version: "1" } as const;
export const textFineTypes = {
  style: { module: textFineModuleRef, name: "TextStyle" },
  motion: { module: textFineModuleRef, name: "TextMotion" },
  pathMotion: { module: textFineModuleRef, name: "TextPathMotion" },
  flowPlacementPolicy: { module: textFineModuleRef, name: "TextFlowPlacementPolicy" },
  pointPlacementPolicy: { module: textFineModuleRef, name: "TextPointPlacementPolicy" },
  pathPlacementPolicy: { module: textFineModuleRef, name: "TextPathPlacementPolicy" },
  placement: { module: textFineModuleRef, name: "TextPlacement" },
  occurrence: { module: textFineModuleRef, name: "FineTextOccurrence" },
  itemSpec: { module: textFineModuleRef, name: "TextItemSpec" },
  plainItemSpec: { module: textFineModuleRef, name: "PlainTextItemSpec" },
  maskSpec: { module: textFineModuleRef, name: "TextMaskSpec" },
} satisfies Record<string, TypeRef>;

export const textFineProducers = {
  bindPoint: { module: textFineModuleRef, name: "bind-point-placement" },
  bindArea: { module: textFineModuleRef, name: "bind-area-placement" },
  bindPath: { module: textFineModuleRef, name: "bind-path-placement" },
  materializePlainItem: { module: textFineModuleRef, name: "materialize-plain-text-item" },
  createOccurrence: { module: textFineModuleRef, name: "create-fine-text-occurrence" },
  renderOccurrence: { module: textFineModuleRef, name: "render-fine-text-occurrence" },
  renderOccurrenceMask: { module: textFineModuleRef, name: "render-fine-text-mask" },
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
  id: { schema: string },
  typography: { schema: visualTextTypographySchema },
  paints: { schema: { kind: "array", items: visualTextPaintSchema } },
});

export const textMotionSchema: ValueSchema = object({
  id: { schema: string },
  item: { schema: visualAnimation, optional: true },
  sequences: { schema: { kind: "array", items: visualTextSequenceSchema } },
});

export const textPathMotionSchema: ValueSchema = object({
  id: { schema: string },
  keyframes: { schema: { kind: "array", items: object({
    atFrame: { schema: integer }, startMarginPx: { schema: { kind: "number", minimum: 0 } },
    easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true },
  }) } },
});

export const textFlowPlacementPolicySchema: ValueSchema = object({
  z: { schema: signedInteger }, flow: { schema: areaFlow },
});
export const textPointPlacementPolicySchema: ValueSchema = object({
  z: { schema: signedInteger },
  anchorInline: { schema: enumString(["start", "center", "end"]) },
  anchorBlock: { schema: enumString(["start", "center", "end"]) },
});
export const textPathPlacementPolicySchema: ValueSchema = object({
  z: { schema: signedInteger }, side: { schema: enumString(["left", "right"]) },
  orientation: { schema: enumString(["follow", "upright"]) },
  startMarginPx: { schema: { kind: "number", minimum: 0 } }, endMarginPx: { schema: { kind: "number", minimum: 0 } },
  align: { schema: enumString(["start", "center", "end"]) }, reverse: { schema: { kind: "boolean" } },
  overflow: { schema: enumString(["visible", "clip"]) },
});
export const textPlacementSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "flow" } }, z: { schema: signedInteger }, frame: { schema: spatialFrameSchema }, flow: { schema: areaFlow } }),
  object({ kind: { schema: { kind: "literal", value: "point" } }, z: { schema: signedInteger }, point: { schema: spatialPointSchema }, anchorInline: { schema: enumString(["start", "center", "end"]) }, anchorBlock: { schema: enumString(["start", "center", "end"]) } }),
  object({ kind: { schema: { kind: "literal", value: "path" } }, z: { schema: signedInteger }, path: { schema: spatialPathSchema }, side: { schema: enumString(["left", "right"]) }, orientation: { schema: enumString(["follow", "upright"]) }, startMarginPx: { schema: { kind: "number", minimum: 0 } }, endMarginPx: { schema: { kind: "number", minimum: 0 } }, align: { schema: enumString(["start", "center", "end"]) }, reverse: { schema: { kind: "boolean" } }, overflow: { schema: enumString(["visible", "clip"]) }, marginMotion: { schema: textPathMotionSchema, optional: true } }),
] };
export const textItemSpecSchema: ValueSchema = object({
  id: { schema: string },
  document: { schema: visualTextDocumentSchema },
});
export const plainTextItemSpecSchema: ValueSchema = object({
  id: { schema: string },
});
const span = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: positiveInteger } });
export const fineTextOccurrenceSchema: ValueSchema = object({
  timelineId: { schema: string },
  id: { schema: string }, span: { schema: span }, placement: { schema: textPlacementSchema },
  document: { schema: visualTextDocumentSchema }, style: { schema: textStyleSchema }, motion: { schema: textMotionSchema },
});
const textMaskSpecSchema = object({

  id: { schema: string }, mode: { schema: enumString(["alpha", "luminance"]) },
  materialFit: { schema: enumString(["contain", "cover", "fill"]) },
});


/** The document an occurrence owns, written the same way inside a Point, Flow or Path. */
const documentChildren = [
  { tag: "P", cardinality: "many",
    summary: "One paragraph of the occurrence's document. It holds direct text, Span runs and Break line breaks in the order they are written, and can be drawn in a Style of its own.",
    attributes: [
      { name: "id", kind: "identifier", required: false, summary: "Names this paragraph inside the document; an omitted id is generated from the paragraph's position." },
      { name: "style", kind: "reference", required: false, accepts: [textFineTypes.style], summary: "Redraws the whole paragraph in another compiled Style, whose typography and Paint replace the item's: the paragraph is shaped with that Style's exact font and set at its size, weight and slant, and painted in its fills, outlines, glows, shadows, boxes and decorations. Geometry, layout and stacking remain facts of the enclosing occurrence." },
    ],
    text: "Direct text between the nested elements is one run of the paragraph, drawn in the paragraph's own Style.",
    children: [
      { tag: "Span", cardinality: "many",
        summary: "One run of the paragraph set apart from its neighbours, drawn in a Style, shaped under a language or laid out in a writing direction of its own.",
        attributes: [
          { name: "id", kind: "identifier", required: false, summary: "Names this run inside the paragraph; an omitted id is generated from the run's position." },
          { name: "style", kind: "reference", required: false, accepts: [textFineTypes.style], summary: "Redraws this run alone in another compiled Style, whose typography and Paint replace the paragraph's: the run is shaped with that Style's exact font and set at its size, weight and slant, and painted in its fills, outlines, glows, shadows, boxes and decorations. Geometry, layout and stacking remain facts of the enclosing occurrence." },
          { name: "language", kind: "literal", required: false, summary: "Names the language tag this run alone is shaped under." },
          { name: "direction", kind: "literal", required: false, values: ["auto", "ltr", "rtl"], summary: "Decides the base writing direction of this run alone." },
        ],
        text: "Direct text is the run's whole content; a Span carries no nested elements and cannot be empty." },
      { tag: "Break", cardinality: "many",
        summary: "Breaks the line at this point and continues the same paragraph on the next one. It is written empty and takes no attributes." },
    ] },
] as const;

/** Absolute timing only. Semantic sources remain free to project a Window first. */
export const fineTextWindowAttributeVocabulary = [
  ...temporalWindowAttributeVocabulary,
] as const;

const fineTextCommonAttributes = [
  { name: "id", kind: "identifier", required: true, summary: "Names this independent text occurrence and both compiled outputs." },
  { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "The absolute Timeline on which this occurrence is placed." },
  { name: "style", kind: "reference", required: true, accepts: [textFineTypes.style], summary: "Chooses the compiled fine-text Style." },
  { name: "z", kind: "literal", required: true, summary: "Sets this occurrence's absolute picture stacking position; it is not part of the reusable Style." },
  { name: "motion", kind: "reference", required: false, accepts: [textFineTypes.motion], summary: "Chooses the Motion; an omitted Motion is still." },
  { name: "content", kind: "reference", required: false, accepts: [textTypes.text], summary: "Reads ordinary graph Text as one plain run; otherwise the element owns its inline document." },
  ...fineTextWindowAttributeVocabulary,
] as const;

const fineTextPorts = [
  { name: "occurrence", type: textFineTypes.occurrence, summary: "The package-owned compiled occurrence used by Studio and sibling text tools." },
  { name: "visual", type: compositionTypes.visualTrack, summary: "The occurrence rendered immediately as one ordinary peer VisualTrack." },
] as const;

export const textFineMarkupSurfaces = [
    { name: "style", tag: "Style", mode: "structured", outputs: [textFineTypes.style],
      vocabulary: {
        summary: "One named bound TextStyle: reusable typography and ordered Paint, with exact font bytes. Placement, layout and stacking belong to each occurrence.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Style, under which occurrences and Spans reference it." },
          { name: "recipe", kind: "reference", required: true, accepts: [recipeType],
            summary: "Chooses the Recipe that states reusable typography and Paint properties of this Style.",
            recipe: [
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
    { name: "motion", tag: "Motion", mode: "structured", outputs: [textFineTypes.motion],
      vocabulary: {
        summary: "One named TextMotion shared by Flow, Point and Path: whole-occurrence keyframes and Sequences over document units.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Motion, under which occurrences reference it." },
        ],
        children: [
          { tag: "ItemKeyframe", cardinality: "many",
            summary: "Fixes the transform, opacity, blur, color or clip of the whole occurrence at one frame.",
            attributes: [
              { name: "at", kind: "literal", required: true, summary: "Lands this keyframe on an exact frame of the occurrence's window." },
              { name: "easing", kind: "literal", required: false, summary: "Decides how the value travels into this keyframe." },
              { name: "x", kind: "literal", required: false, summary: "Translates the occurrence horizontally, in pixels." },
              { name: "y", kind: "literal", required: false, summary: "Translates the occurrence vertically, in pixels." },
              { name: "scale", kind: "literal", required: false, summary: "Scales the occurrence uniformly; defaults to `1`." },
              { name: "rotate", kind: "literal", required: false, summary: "Rotates the occurrence, in degrees." },
              { name: "skew-x", kind: "literal", required: false, summary: "Skews the occurrence horizontally, in degrees." },
              { name: "skew-y", kind: "literal", required: false, summary: "Skews the occurrence vertically, in degrees." },
              { name: "opacity", kind: "literal", required: false, summary: "Sets the occurrence's opacity at this keyframe." },
              { name: "blur", kind: "literal", required: false, summary: "Blurs the occurrence by this radius in pixels." },
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
          "A whole-occurrence animation needs at least two keyframes.",
          "A `<Sequence>` accepts only `<Keyframe>` children and carries at least two of them; a `<Keyframe>` takes the same attributes as an `<ItemKeyframe>`, with `at` read as the progress from 0 to 1 through one unit.",
          "The TextMotion Record is published under the bare `id`, and the element carries no text content.",
        ],
      },
    },
    { name: "path-motion", tag: "PathMotion", mode: "structured", outputs: [textFineTypes.pathMotion],
      vocabulary: {
        summary: "One Path-specific margin relation; it moves Path text along its own geometry without entering general TextMotion.",
        attributes: [{ name: "id", kind: "identifier", required: true, summary: "Names this PathMotion." }],
        children: [{ tag: "Keyframe", cardinality: "many", summary: "Fixes the Path start margin at one occurrence-local frame.", attributes: [
          { name: "at", kind: "literal", required: true, summary: "Lands this keyframe on an exact frame of the occurrence's Window." },
          { name: "margin", kind: "literal", required: true, summary: "Sets the Path start margin in pixels." },
          { name: "easing", kind: "literal", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], summary: "Decides how the margin travels into this keyframe." },
        ] }],
        example: `<text:PathMotion id="orbit-travel">
  <text:Keyframe at="0" margin="0"/>
  <text:Keyframe at="90" margin="120" easing="ease-in-out"/>
</text:PathMotion>`,
        notes: ["A PathMotion needs at least two ordered Keyframes and is accepted only by a Path occurrence."],
      },
    },
    { name: "flow", tag: "Flow", mode: "structured", outputs: [textFineTypes.itemSpec, textFineTypes.plainItemSpec, textFineTypes.motion, textFineTypes.flowPlacementPolicy, textFineTypes.placement, textFineTypes.occurrence, compositionTypes.visualTrack],
      vocabulary: {
        summary: "One independently timed fine-text occurrence flowing inside a SpatialFrame; no aggregate Text Track is created.",
        attributes: [
          ...fineTextCommonAttributes,
          { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "The Frame inside which this document flows and wraps." },
          { name: "inline-size", kind: "literal", required: false, values: ["hug", "fixed"], summary: "Whether the text box hugs content or fills the Frame inline; defaults to fixed." },
          { name: "block-size", kind: "literal", required: false, values: ["hug", "fixed"], summary: "Whether the text box hugs content or fills the Frame in the block direction; defaults to fixed." },
          { name: "padding", kind: "literal", required: false, summary: "Insets text from the Frame as one, two or four pixel values; defaults to zero." },
          { name: "align", kind: "literal", required: false, values: ["start", "center", "end", "justify"], summary: "Aligns text inline; defaults to center." },
          { name: "block-align", kind: "literal", required: false, values: ["start", "center", "end"], summary: "Aligns text on the block axis; defaults to center." },
          { name: "wrap", kind: "literal", required: false, values: ["none", "word", "grapheme"], summary: "Chooses line-breaking policy; defaults to word." },
          { name: "overflow", kind: "literal", required: false, values: ["visible", "clip", "ellipsis", "shrink"], summary: "Chooses Flow overflow; defaults to visible." },
          { name: "max-lines", kind: "literal", required: false, summary: "Caps lines for ellipsis or shrink overflow." },
          { name: "minimum-scale", kind: "literal", required: false, summary: "Sets the minimum scale required by shrink overflow." },
          { name: "clip", kind: "literal", required: false, values: ["true", "false"], summary: "Clips the Flow to its Frame; defaults to false." },
          { name: "columns", kind: "literal", required: false, summary: "Sets a positive column count; defaults to one." },
          { name: "column-gap", kind: "literal", required: false, summary: "Sets the non-negative gap between columns; defaults to zero." },
          { name: "metric-edge", kind: "literal", required: false, values: ["line-box", "cap-height", "ink"], summary: "Chooses the typographic edge used for alignment; defaults to line-box." },
        ],
        children: documentChildren,
        text: "Direct text is the occurrence's whole document, read as one paragraph.",
        ports: fineTextPorts,
        example: `<text:Flow id="title" timeline={film.timeline} within={title-frame} style={title-style} z="40" align="center" block-align="center" during={film.window}>EDIT MEANING</text:Flow>`,
        notes: [
          "This is one occurrence, not a container. Compose its `.visual` beside media, captions and other visual outputs.",
          "Timing is absolute: `during` consumes an existing Window. Timeline or domain author packages declare the Window first.",
        ],
      },
    },
    { name: "point", tag: "Point", mode: "structured", outputs: [textFineTypes.itemSpec, textFineTypes.plainItemSpec, textFineTypes.motion, textFineTypes.pointPlacementPolicy, textFineTypes.placement, textFineTypes.occurrence, compositionTypes.visualTrack],
      vocabulary: {
        summary: "One independently timed fine-text occurrence anchored at a SpatialPoint; no aggregate Text Track is created.",
        attributes: [
          ...fineTextCommonAttributes,
          { name: "point", kind: "reference", required: true, accepts: [spatialTypes.point], summary: "The Point from which the occurrence's anchors hang the text." },
          { name: "anchor-inline", kind: "literal", required: false, values: ["start", "center", "end"], summary: "Anchors the text inline at the Point; defaults to center." },
          { name: "anchor-block", kind: "literal", required: false, values: ["start", "center", "end"], summary: "Anchors the text on the block axis at the Point; defaults to center." },
        ],
        children: documentChildren,
        text: "Direct text is the occurrence's whole document, read as one paragraph.",
        ports: fineTextPorts,
        example: `<text:Point id="label" timeline={film.timeline} point={label-point} style={label-style} z="40" anchor-inline="start" during={label-window}>ORBIT</text:Point>`,
        notes: ["This is one occurrence, not a container; semantic sources can supply a resolved Window without becoming part of this text surface."],
      },
    },
    { name: "path", tag: "Path", mode: "structured", outputs: [textFineTypes.itemSpec, textFineTypes.plainItemSpec, textFineTypes.motion, textFineTypes.pathMotion, textFineTypes.pathPlacementPolicy, textFineTypes.placement, textFineTypes.occurrence, compositionTypes.visualTrack],
      vocabulary: {
        summary: "One independently timed fine-text occurrence set along a SpatialPath; no aggregate Text Track is created.",
        attributes: [
          ...fineTextCommonAttributes,
          { name: "path", kind: "reference", required: true, accepts: [spatialTypes.path], summary: "The Path along which the glyphs are set." },
          { name: "side", kind: "literal", required: false, values: ["left", "right"], summary: "Chooses the side of the Path; defaults to left." },
          { name: "orientation", kind: "literal", required: false, values: ["follow", "upright"], summary: "Chooses whether glyphs follow the Path or remain upright; defaults to follow." },
          { name: "start-margin", kind: "literal", required: false, summary: "Starts text this many pixels along the Path; defaults to zero." },
          { name: "end-margin", kind: "literal", required: false, summary: "Ends text this many pixels before the Path end; defaults to zero." },
          { name: "align", kind: "literal", required: false, values: ["start", "center", "end"], summary: "Aligns text between Path margins; defaults to start." },
          { name: "reverse", kind: "literal", required: false, values: ["true", "false"], summary: "Reverses Path direction; defaults to false." },
          { name: "overflow", kind: "literal", required: false, values: ["visible", "clip"], summary: "Chooses whether text beyond the Path remains visible; defaults to visible." },
          { name: "path-motion", kind: "reference", required: false, accepts: [textFineTypes.pathMotion], summary: "Moves the start margin along this Path; omitted means still." },
        ],
        children: documentChildren,
        text: "Direct text is the occurrence's whole document, read as one paragraph.",
        ports: fineTextPorts,
        example: `<text:Path id="orbit-copy" timeline={film.timeline} path={orbit} style={orbit-style} z="40" path-motion={orbit-travel} during={orbit-window}>FOLLOW THE CURVE</text:Path>`,
        notes: ["This is one occurrence, not a container; Path-specific layout and margin motion belong here, not to the reusable Style or general Motion."],
      },
    },
    { name: "mask", tag: "Mask", mode: "structured", outputs: [textFineTypes.maskSpec, compositionTypes.visualTrack],
      vocabulary: {
        summary: "Cuts one owned Surface to the shape of one fine-text occurrence and publishes the result as a peer VisualTrack.",
        appearance: "The words of the authored occurrence filled with a picture: its letterforms are cut out of the material Surface, and every pixel outside the glyphs is transparent. Only the glyph shapes carry across — the Style's own fills, outlines and boxes are not drawn — so what reads on screen is one horizontal line of type set at the padding and inline and block alignment of its Frame, with the material scaled to contain, cover or fill that Frame behind it. It appears and vanishes with the occurrence and plays its whole-occurrence Motion.",
        preview: previewImage("Mask.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Mask, under which its VisualTrack is published." },
          { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline],
            summary: "The absolute Timeline shared with the consumed occurrence." },
          { name: "text", kind: "reference", required: true, accepts: [textFineTypes.occurrence],
            summary: "Chooses the one authored fine-text occurrence that gives the mask its shape and timing." },
          { name: "material", kind: "reference", required: true, accepts: [mediaTypes.compositableSurface],
            summary: "Chooses the Surface shown through the text." },
          { name: "mode", kind: "literal", required: false, values: ["alpha", "luminance"],
            summary: "Whether the text masks by coverage or by brightness; defaults to `alpha`." },
          { name: "fit", kind: "literal", required: false, values: ["contain", "cover", "fill"],
            summary: "How the material occupies the masked occurrence; defaults to `cover`." },
        ],
        ports: [
          { name: "visual", type: compositionTypes.visualTrack,
            summary: "The masked picture, an ordinary peer VisualTrack." },
        ],
        example: `<text:Mask id="masked-title" timeline={film.timeline} text={mask-shape.occurrence} material={material}/>`,
        notes: [
          "A Mask is written empty and accepts no children.",
          "The material must be a still Surface; a timed material is refused and materializes through an independent package.",
          "The occurrence must be one Flow holding one unstyled paragraph, without Sequence motion, and drawn in a Style that is fixed in both axes, unwrapped, single-column, horizontally written, undecorated, without `ellipsis` or `shrink` overflow, and whose weight and style match its primary exact font without synthesis; anything else is refused.",
        ],
      },
    },
  ] as const;


export const textFineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: textFineModuleRef.name,
  version: textFineModuleRef.version,
  dependencies: [timelineDependency, spatialDependency, mediaDependency, compositionDependency, textDependency, temporalDependency],
  types: [
    { name: textFineTypes.style.name },
    { name: textFineTypes.motion.name },
    { name: textFineTypes.pathMotion.name },
    { name: textFineTypes.flowPlacementPolicy.name },
    { name: textFineTypes.pointPlacementPolicy.name },
    { name: textFineTypes.pathPlacementPolicy.name },
    { name: textFineTypes.placement.name },
    { name: textFineTypes.occurrence.name },
    { name: textFineTypes.itemSpec.name },
    { name: textFineTypes.plainItemSpec.name },
    { name: textFineTypes.maskSpec.name },
  ],
  capabilities: [],
  producers: [
    { name: textFineProducers.materializePlainItem.name, inputs: [{ name: "spec", type: textFineTypes.plainItemSpec }, { name: "content", type: textTypes.text }], result: { kind: "output" as const, name: "spec", type: textFineTypes.itemSpec } },
    { name: textFineProducers.bindPoint.name, inputs: [{ name: "point", type: spatialTypes.point }, { name: "policy", type: textFineTypes.pointPlacementPolicy }], result: { kind: "output" as const, name: "placement", type: textFineTypes.placement } },
    { name: textFineProducers.bindArea.name, inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "policy", type: textFineTypes.flowPlacementPolicy }], result: { kind: "output" as const, name: "placement", type: textFineTypes.placement } },
    { name: textFineProducers.bindPath.name, inputs: [{ name: "path", type: spatialTypes.path }, { name: "policy", type: textFineTypes.pathPlacementPolicy }, { name: "marginMotion", type: textFineTypes.pathMotion }], result: { kind: "output" as const, name: "placement", type: textFineTypes.placement } },
    { name: textFineProducers.createOccurrence.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "placement", type: textFineTypes.placement }, { name: "spec", type: textFineTypes.itemSpec }, { name: "style", type: textFineTypes.style }, { name: "motion", type: textFineTypes.motion }, { name: "window", type: temporalTypes.window }], result: { kind: "output" as const, name: "occurrence", type: textFineTypes.occurrence } },
    { name: textFineProducers.renderOccurrence.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "occurrence", type: textFineTypes.occurrence }], result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } },
    { name: textFineProducers.renderOccurrenceMask.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "occurrence", type: textFineTypes.occurrence }, { name: "material", type: mediaTypes.compositableSurface }, { name: "spec", type: textFineTypes.maskSpec }], result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } },
  ],
};
