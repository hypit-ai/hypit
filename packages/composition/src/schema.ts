import { compositableSurfaceSchema, fontArtifactSchema, mediaDependency } from "@hypit/media";
import { programSpaceDependency } from "@hypit/program-space";
import type { ValueSchema } from "@hypit/protocol";
import { VISUAL_IR_V1, VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@hypit/visual-ir";
export { mediaDependency, programSpaceDependency };
const string = { kind: "string", minLength: 1 } as const; const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const; const signedInteger = { kind: "number", integer: true } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
  allowUnknown = false,
): ValueSchema => ({ kind: "object", fields, ...(allowUnknown ? { allowUnknown: true } : {}) });
const audioBlobRef = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  resource: { schema: { kind: "string", minLength: 5, maxLength: 256 } },
  size: { schema: integer },
  mediaType: { schema: { kind: "literal", value: "audio/wav" } },
});
const mediaBlobRef = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  resource: { schema: { kind: "string", minLength: 5, maxLength: 256 } },
  size: { schema: integer },
  mediaType: { schema: string },
});
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const rational = object({ numerator: { schema: integer }, denominator: { schema: positiveInteger } });
const samplingSegment = object({
  target: { schema: object({ startFrame: { schema: integer }, endFrameExclusive: { schema: positiveInteger } }) },
  sourceFrame: { schema: rational }, rate: { schema: rational },
  loop: { schema: object({ startFrame: { schema: integer }, endFrameExclusive: { schema: positiveInteger } }), optional: true },
});
export const visualTimedSamplingSchema = object({
  sourceFrameRate: { schema: rational }, sourceFrameCount: { schema: positiveInteger },
  segments: { schema: { kind: "array", minItems: 1, items: samplingSegment } },
});
const styleDeclaration: ValueSchema = { kind: "oneOf", variants: VISUAL_STYLE_NAMES_V1.map((name) => object({
  name: { schema: { kind: "literal", value: name } }, value: { schema: Object.hasOwn(VISUAL_STYLE_ENUM_VALUES_V1, name)
    ? { kind: "string", enum: VISUAL_STYLE_ENUM_VALUES_V1[name as keyof typeof VISUAL_STYLE_ENUM_VALUES_V1] }
    : { kind: "oneOf", variants: [{ kind: "string" }, { kind: "number" }] } },
})) };
const attribute = object({ name: { schema: string }, value: { schema: { kind: "string" } } });
const keyframe = object({ atFrame: { schema: integer }, easing: { schema: { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] }, optional: true }, style: { schema: { kind: "array", minItems: 1, items: styleDeclaration } } });
const animation = object({ keyframes: { schema: { kind: "array", minItems: 2, items: keyframe } } });
const base = { id: { schema: string }, parent: { schema: string, optional: true }, order: { schema: integer }, style: { schema: { kind: "array", items: styleDeclaration } }, attributes: { schema: { kind: "array", items: attribute }, optional: true }, animation: { schema: animation, optional: true } } as const;
export const visualBoxSchema: ValueSchema = object({ ...base, kind: { schema: { kind: "literal", value: "box" } } });
export const visualMaskSchema: ValueSchema = object({
  ...base,
  kind: { schema: { kind: "literal", value: "mask" } },
  mode: { schema: { kind: "string", enum: ["alpha", "luminance"] } },
  maskElement: { schema: string },
  contentElement: { schema: string },
});
export const visualTextSchema: ValueSchema = object({ ...base, kind: { schema: { kind: "literal", value: "text" } }, text: { schema: { kind: "string" } }, fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } } });
const finiteNumber = { kind: "number" } as const;
const boolean = { kind: "boolean" } as const;
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });
export const visualColorPaintSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "solid" } }, color: { schema: string } }),
  object({
    kind: { schema: { kind: "literal", value: "linear-gradient" } }, angleDeg: { schema: finiteNumber },
    stops: { schema: { kind: "array", minItems: 2, items: object({ offset: { schema: finiteNumber }, color: { schema: string }, opacity: { schema: finiteNumber } }) } },
  }),
  object({
    kind: { schema: { kind: "literal", value: "radial-gradient" } },
    center: { schema: object({ x: { schema: finiteNumber }, y: { schema: finiteNumber } }) },
    stops: { schema: { kind: "array", minItems: 2, items: object({ offset: { schema: finiteNumber }, color: { schema: string }, opacity: { schema: finiteNumber } }) } },
  }),
] };
const textShadow = object({
  paint: { schema: visualColorPaintSchema }, offsetX: { schema: finiteNumber }, offsetY: { schema: finiteNumber },
  blurPx: { schema: number }, spreadPx: { schema: finiteNumber },
});
const boxDecoration = object({
  fill: { schema: visualColorPaintSchema, optional: true },
  border: { schema: object({
    paint: { schema: visualColorPaintSchema },
    widthsPx: { schema: object({ top: { schema: number }, right: { schema: number }, bottom: { schema: number }, left: { schema: number } }) },
    style: { schema: enumString(["solid", "dashed", "dotted"]) },
  }), optional: true },
  paddingPx: { schema: object({ top: { schema: number }, right: { schema: number }, bottom: { schema: number }, left: { schema: number } }) },
  radiiPx: { schema: object({ topLeft: { schema: number }, topRight: { schema: number }, bottomRight: { schema: number }, bottomLeft: { schema: number } }) },
  shadows: { schema: { kind: "array", items: textShadow } },
  tail: { schema: object({
    side: { schema: enumString(["top", "right", "bottom", "left"]) }, offset: { schema: finiteNumber },
    widthPx: { schema: number }, heightPx: { schema: number }, paint: { schema: visualColorPaintSchema },
  }), optional: true },
});
export const visualTextPaintSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "fill" } }, paint: { schema: visualColorPaintSchema } }),
  object({ kind: { schema: { kind: "literal", value: "stroke" } }, paint: { schema: visualColorPaintSchema }, widthPx: { schema: number }, placement: { schema: enumString(["inside", "center", "outside"]) } }),
  object({ kind: { schema: { kind: "literal", value: "shadow" } }, paint: { schema: visualColorPaintSchema }, offsetX: { schema: finiteNumber }, offsetY: { schema: finiteNumber }, blurPx: { schema: number }, spreadPx: { schema: finiteNumber } }),
  object({ kind: { schema: { kind: "literal", value: "glow" } }, paint: { schema: visualColorPaintSchema }, blurPx: { schema: number }, spreadPx: { schema: finiteNumber } }),
  object({ kind: { schema: { kind: "literal", value: "box" } }, target: { schema: enumString(["frame", "content", "paragraph", "line", "run", "word", "grapheme"]) }, continuity: { schema: enumString(["isolated", "joined"]) }, decoration: { schema: boxDecoration } }),
] };
const axis = object({ tag: { schema: { kind: "string", minLength: 4, maxLength: 4 } }, value: { schema: finiteNumber } });
const feature = object({ tag: { schema: { kind: "string", minLength: 4, maxLength: 4 } }, enabled: { schema: boolean } });
const textTypographyFields = {
  fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema } as ValueSchema, optional: false },
  sizePx: { schema: { kind: "number", minimum: 0.000001 }, optional: false },
  weight: { schema: { kind: "number", integer: true, minimum: 1, maximum: 1000 }, optional: false },
  style: { schema: enumString(["normal", "italic", "oblique"]), optional: false },
  axes: { schema: { kind: "array", items: axis } as ValueSchema, optional: false },
  features: { schema: { kind: "array", items: feature } as ValueSchema, optional: false },
  synthesis: { schema: enumString(["none", "weight", "style", "weight-style"]), optional: false },
  kerning: { schema: enumString(["auto", "normal", "none"]), optional: false },
  trackingPx: { schema: finiteNumber, optional: false }, wordSpacingPx: { schema: finiteNumber, optional: false },
  lineHeight: { schema: { kind: "number", minimum: 0.000001 }, optional: false },
  language: { schema: string, optional: true },
  direction: { schema: enumString(["auto", "ltr", "rtl"]), optional: false },
  writingMode: { schema: enumString(["horizontal-tb", "vertical-rl", "vertical-lr"]), optional: false },
  baselineShiftPx: { schema: finiteNumber, optional: false }, tabSize: { schema: positiveInteger, optional: false },
  indentationPx: { schema: finiteNumber, optional: false }, paragraphBeforePx: { schema: finiteNumber, optional: false },
  paragraphAfterPx: { schema: finiteNumber, optional: false },
  transform: { schema: enumString(["none", "uppercase", "lowercase", "capitalize"]), optional: false },
  variantCaps: { schema: enumString(["normal", "small-caps", "all-small-caps"]), optional: false },
  verticalAlign: { schema: enumString(["baseline", "super", "sub"]), optional: false },
  decorations: { schema: { kind: "array", items: object({
    line: { schema: enumString(["underline", "overline", "line-through"]) },
    paint: { schema: visualColorPaintSchema },
    style: { schema: enumString(["solid", "double", "dotted", "dashed", "wavy"]) },
    thicknessPx: { schema: number, optional: true },
    offsetPx: { schema: finiteNumber, optional: true },
    skipInk: { schema: boolean },
  }) } as ValueSchema, optional: false },
  cjk: { schema: object({ textSpacing: { schema: enumString(["normal", "none"]) }, punctuationTrim: { schema: enumString(["none", "start", "end", "adjacent", "all"]) } }), optional: false },
} as const;
export const visualTextTypographySchema = object(textTypographyFields);
const runTypography = object(Object.fromEntries(Object.entries(textTypographyFields).map(([name, field]) => [name, { schema: field.schema, optional: true }])));
const runStyle = object({ typography: { schema: runTypography, optional: true }, paints: { schema: { kind: "array", items: visualTextPaintSchema }, optional: true } });
const textInline: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "text" } }, id: { schema: string }, text: { schema: { kind: "string", minLength: 1 } }, style: { schema: runStyle, optional: true }, language: { schema: string, optional: true }, direction: { schema: enumString(["auto", "ltr", "rtl"]), optional: true } }),
  object({ kind: { schema: { kind: "literal", value: "break" } }, id: { schema: string } }),
] };
export const visualTextDocumentSchema = object({ paragraphs: { schema: { kind: "array", minItems: 1, items: object({ id: { schema: string }, inlines: { schema: { kind: "array", minItems: 1, items: textInline } }, style: { schema: runStyle, optional: true } }) } } });
export const visualTextFlowSchema = object({
  form: { schema: { kind: "oneOf", variants: [
    object({ kind: { schema: { kind: "literal", value: "point" } }, anchorInline: { schema: enumString(["start", "center", "end"]) }, anchorBlock: { schema: enumString(["start", "center", "end"]) } }),
    object({ kind: { schema: { kind: "literal", value: "area" } } }),
  ] } },
  inlineSize: { schema: enumString(["hug", "fixed"]) }, blockSize: { schema: enumString(["hug", "fixed"]) },
  paddingPx: { schema: object({ inlineStart: { schema: number }, inlineEnd: { schema: number }, blockStart: { schema: number }, blockEnd: { schema: number } }) },
  inlineAlign: { schema: enumString(["start", "center", "end", "justify"]) }, blockAlign: { schema: enumString(["start", "center", "end"]) },
  wrap: { schema: enumString(["none", "word", "grapheme"]) }, overflow: { schema: enumString(["visible", "clip", "ellipsis", "shrink"]) },
  maxLines: { schema: positiveInteger, optional: true }, minimumScale: { schema: { kind: "number", minimum: 0.000001, maximum: 1 }, optional: true },
  clipToFrame: { schema: boolean }, columns: { schema: positiveInteger }, columnGapPx: { schema: number },
  metricEdge: { schema: enumString(["line-box", "cap-height", "ink"]) },
});
export const visualTextSequenceSchema = object({
  id: { schema: string }, unit: { schema: enumString(["paragraph", "line", "run", "word", "grapheme"]) },
  range: { schema: object({ start: { schema: integer }, endExclusive: { schema: positiveInteger } }) },
  order: { schema: enumString(["forward", "reverse", "random"]) }, startFrame: { schema: integer },
  unitDurationFrames: { schema: positiveInteger }, staggerFrames: { schema: integer }, cycles: { schema: positiveInteger },
  seed: { schema: signedInteger, optional: true },
  keyframes: { schema: { kind: "array", minItems: 2, items: object({
    atProgress: { schema: { kind: "number", minimum: 0, maximum: 1 } },
    easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true },
    style: { schema: { kind: "array", minItems: 1, items: styleDeclaration } },
  }) } },
});
const textFlowElement = object({ ...base, kind: { schema: { kind: "literal", value: "text-flow" } }, document: { schema: visualTextDocumentSchema }, typography: { schema: visualTextTypographySchema }, paints: { schema: { kind: "array", items: visualTextPaintSchema } }, flow: { schema: visualTextFlowSchema }, sequences: { schema: { kind: "array", items: visualTextSequenceSchema } } });
export const visualPathCommandSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: enumString(["move", "line"]) }, x: { schema: finiteNumber }, y: { schema: finiteNumber } }),
  object({ kind: { schema: { kind: "literal", value: "quadratic" } }, controlX: { schema: finiteNumber }, controlY: { schema: finiteNumber }, x: { schema: finiteNumber }, y: { schema: finiteNumber } }),
  object({ kind: { schema: { kind: "literal", value: "cubic" } }, control1X: { schema: finiteNumber }, control1Y: { schema: finiteNumber }, control2X: { schema: finiteNumber }, control2Y: { schema: finiteNumber }, x: { schema: finiteNumber }, y: { schema: finiteNumber } }),
  object({ kind: { schema: { kind: "literal", value: "close" } } }),
] };
const pathTextElement = object({ ...base, kind: { schema: { kind: "literal", value: "path-text" } }, document: { schema: visualTextDocumentSchema }, typography: { schema: visualTextTypographySchema }, paints: { schema: { kind: "array", items: visualTextPaintSchema } }, path: { schema: { kind: "array", minItems: 2, items: visualPathCommandSchema } }, side: { schema: enumString(["left", "right"]) }, orientation: { schema: enumString(["follow", "upright"]) }, startMarginPx: { schema: number }, endMarginPx: { schema: number }, align: { schema: enumString(["start", "center", "end"]) }, reverse: { schema: boolean }, overflow: { schema: enumString(["visible", "clip"]) }, sequences: { schema: { kind: "array", items: visualTextSequenceSchema } }, marginAnimation: { schema: object({ keyframes: { schema: { kind: "array", minItems: 2, items: object({ atFrame: { schema: integer }, startMarginPx: { schema: number }, easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true } }) } } }), optional: true } });
export const visualImageSchema: ValueSchema = object({ ...base, kind: { schema: { kind: "literal", value: "image" } }, artifact: { schema: mediaBlobRef }, sampling: { schema: visualTimedSamplingSchema, optional: true }, muted: { schema: { kind: "boolean" }, optional: true } });
export const visualVideoSchema: ValueSchema = object({ ...base, kind: { schema: { kind: "literal", value: "video" } }, artifact: { schema: mediaBlobRef }, sampling: { schema: visualTimedSamplingSchema, optional: true }, muted: { schema: { kind: "boolean" }, optional: true } });
export const visualSurfaceSchema: ValueSchema = object({ ...base, kind: { schema: { kind: "literal", value: "surface" } }, surface: { schema: compositableSurfaceSchema }, sampling: { schema: visualTimedSamplingSchema, optional: true } });
export const visualProgramSchema: ValueSchema = object({ ...base, kind: { schema: { kind: "literal", value: "program" } }, program: { schema: object({ format: { schema: string }, payload: { schema: object({}, true) }, artifacts: { schema: { kind: "array", items: mediaBlobRef } } }) } });
export const visualElementSchema: ValueSchema = { kind: "oneOf", variants: [visualBoxSchema, visualMaskSchema, visualTextSchema, textFlowElement, pathTextElement, visualImageSchema, visualVideoSchema, visualSurfaceSchema, visualProgramSchema] };
const span = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
const present = object({ id: { schema: string }, span: { schema: span }, stacking: { schema: object({ order: { schema: signedInteger }, tieBreak: { schema: string } }) }, elements: { schema: { kind: "array", minItems: 1, items: visualElementSchema } } });
export const visualTrackSchema: ValueSchema = object({ kind: { schema: { kind: "literal", value: "visual" } }, programSpaceId: { schema: string }, visualIr: { schema: { kind: "literal", value: VISUAL_IR_V1 } }, id: { schema: string }, presents: { schema: { kind: "array", items: present } } });
const audioSampleSpan = object({ startSample: { schema: integer }, endSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } } });
const audioClip = object({
  id: { schema: string },
  artifact: { schema: audioBlobRef },
  target: { schema: audioSampleSpan },
  source: { schema: object({
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    startSample: { schema: integer },
    endSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
    loop: { schema: { kind: "boolean" } },
    phaseSample: { schema: integer },
  }) },
  playbackRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } },
  pitch: { schema: { kind: "literal", value: "preserve" } },
  gain: { schema: { kind: "number", minimum: 0, maximum: 64 } },
  fadeInSamples: { schema: integer },
  fadeOutSamples: { schema: integer },
});
export const audioTrackSchema: ValueSchema = object({ kind: { schema: { kind: "literal", value: "audio" } }, programSpaceId: { schema: string }, id: { schema: string }, clips: { schema: { kind: "array", items: audioClip } } });
export const compositionSchema: ValueSchema = object({ id: { schema: string }, canvas: { schema: object({ width: { schema: integer }, height: { schema: integer }, clearColor: { schema: string } }) }, tracks: { schema: { kind: "array", items: { kind: "oneOf", variants: [visualTrackSchema, audioTrackSchema] } } } });
