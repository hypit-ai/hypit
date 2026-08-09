import type { FontArtifactRef } from "@narratage/media";
import type {
  VisualColorPaint,
  VisualPathTextElement,
  VisualTextDocument,
  VisualTextFlowElement,
  VisualTextPaintLayer,
  VisualTextRunStyle,
  VisualTextSequenceAnimation,
  VisualTextTypography,
  VisualVectorPathCommand,
} from "@narratage/composition";
import { digestOf } from "@narratage/protocol";

type TerminalTextElement = VisualTextFlowElement | VisualPathTextElement;

export type TextRenderContext = {
  readonly trackId: string;
  readonly presentId: string;
  readonly durationFrames: number;
  readonly durationSeconds: string;
  readonly presentStartFrame: number;
  readonly programNumerator: number;
  readonly programDenominator: number;
  readonly escape: (value: string) => string;
  readonly stableId: (parts: readonly string[]) => string;
  readonly exactFontFamily: (font: FontArtifactRef) => string;
  readonly baseStyle: string;
  readonly commonAttributes: string;
};

function number(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function colorStop(stop: { readonly offset: number; readonly color: string; readonly opacity: number }): string {
  const color = stop.opacity === 1
    ? stop.color
    : `color-mix(in srgb,${stop.color} ${number(stop.opacity * 100)}%,transparent)`;
  return `${color} ${number(stop.offset * 100)}%`;
}

export function colorPaintCss(paint: VisualColorPaint): string {
  if (paint.kind === "solid") return paint.color;
  const stops = paint.stops.map(colorStop).join(",");
  if (paint.kind === "linear-gradient") return `linear-gradient(${number(paint.angleDeg)}deg,${stops})`;
  return `radial-gradient(circle at ${number(paint.center.x * 100)}% ${number(paint.center.y * 100)}%,${stops})`;
}

function solidPaint(paint: VisualColorPaint): string | undefined {
  return paint.kind === "solid" ? paint.color : undefined;
}

function exactFontCss(fonts: readonly FontArtifactRef[] | undefined, exactFontFamily: TextRenderContext["exactFontFamily"]): string[] {
  if (fonts === undefined) return [];
  return [
    `font-family:${fonts.map(exactFontFamily).join(",")}`,
    `font-weight:${fonts[0]!.weight}`,
    `font-style:${fonts[0]!.style}`,
    "font-synthesis:none",
  ];
}

function typographyCss(
  typography: VisualTextTypography,
  exactFontFamily: TextRenderContext["exactFontFamily"],
): string[] {
  const synthesis = typography.synthesis === "weight-style"
    ? "weight style"
    : typography.synthesis;
  const decorations = typography.decorations;
  const decoration = decorations[0];
  if (decorations.some((item) => item.paint.kind !== "solid")) {
    throw new Error("HyperFrames Text decorations currently require solid Paint.");
  }
  if (decoration !== undefined && decorations.some((item) =>
    item.style !== decoration.style
    || item.paint.kind !== "solid"
    || decoration.paint.kind !== "solid"
    || item.paint.color !== decoration.paint.color
    || item.thicknessPx !== decoration.thicknessPx
    || item.offsetPx !== decoration.offsetPx
    || item.skipInk !== decoration.skipInk)) {
    throw new Error("HyperFrames Text decorations on one run must share Paint and metric settings.");
  }
  return [
    ...(typography.fonts === undefined
      ? [`font-family:${typography.prototypeFamily}`]
      : exactFontCss(typography.fonts, exactFontFamily)),
    `font-size:${number(typography.sizePx)}px`,
    `font-weight:${typography.weight}`,
    `font-style:${typography.style}`,
    `font-synthesis:${synthesis}`,
    `font-kerning:${typography.kerning}`,
    `font-variation-settings:${typography.axes.length === 0 ? "normal" : typography.axes.map((axis) => `"${axis.tag}" ${number(axis.value)}`).join(",")}`,
    `font-feature-settings:${typography.features.length === 0 ? "normal" : typography.features.map((feature) => `"${feature.tag}" ${feature.enabled ? 1 : 0}`).join(",")}`,
    `letter-spacing:${number(typography.trackingPx)}px`,
    `word-spacing:${number(typography.wordSpacingPx)}px`,
    `line-height:${number(typography.lineHeight)}`,
    ...(typography.direction === "auto" ? [] : [`direction:${typography.direction}`]),
    `writing-mode:${typography.writingMode}`,
    `text-transform:${typography.transform}`,
    `font-variant-caps:${typography.variantCaps}`,
    `tab-size:${typography.tabSize}`,
    `text-indent:${number(typography.indentationPx)}px`,
    ...(typography.baselineShiftPx === 0 ? [] : [`vertical-align:${number(typography.baselineShiftPx)}px`]),
    ...(typography.baselineShiftPx !== 0 || typography.verticalAlign === "baseline" ? [] : [`vertical-align:${typography.verticalAlign}`]),
    `text-autospace:${typography.cjk.textSpacing === "normal" ? "normal" : "no-autospace"}`,
    `text-spacing-trim:${typography.cjk.punctuationTrim === "none" ? "space-all" : typography.cjk.punctuationTrim === "start" ? "trim-start" : typography.cjk.punctuationTrim === "adjacent" ? "trim-both" : typography.cjk.punctuationTrim === "all" ? "trim-all" : "space-first"}`,
    ...(decoration === undefined ? [] : [
      `text-decoration-line:${decorations.map((item) => item.line).join(" ")}`,
      `text-decoration-color:${decoration.paint.kind === "solid" ? decoration.paint.color : "currentColor"}`,
      `text-decoration-style:${decoration.style}`,
      ...(decoration.thicknessPx === undefined ? [] : [`text-decoration-thickness:${number(decoration.thicknessPx)}px`]),
      ...(decoration.offsetPx === undefined ? [] : [`text-underline-offset:${number(decoration.offsetPx)}px`]),
      `text-decoration-skip-ink:${decoration.skipInk ? "auto" : "none"}`,
    ]),
  ];
}

function textLanguageAttributes(
  typography: VisualTextTypography,
  escape: TextRenderContext["escape"],
  language?: string,
  direction?: "auto" | "ltr" | "rtl",
): string {
  const actualLanguage = language ?? typography.language;
  const actualDirection = direction ?? typography.direction;
  return [
    ...(actualLanguage === undefined ? [] : [`lang="${escape(actualLanguage)}"`]),
    `dir="${actualDirection}"`,
  ].join(" ");
}

function mergedTypography(
  base: VisualTextTypography,
  style: VisualTextRunStyle | undefined,
): VisualTextTypography {
  const override = style?.typography;
  if (override === undefined) return base;
  const fontSelection = override.fonts !== undefined
    ? { fonts: override.fonts }
    : override.prototypeFamily !== undefined
      ? { prototypeFamily: override.prototypeFamily }
      : base.fonts === undefined
        ? { prototypeFamily: base.prototypeFamily! }
        : { fonts: base.fonts };
  const {
    fonts: _fonts,
    prototypeFamily: _prototypeFamily,
    axes: _axes,
    features: _features,
    decorations: _decorations,
    cjk: _cjk,
    ...scalarOverrides
  } = override;
  return {
    ...base,
    ...scalarOverrides,
    ...fontSelection,
    axes: override.axes ?? base.axes,
    features: override.features ?? base.features,
    decorations: override.decorations ?? base.decorations,
    cjk: override.cjk === undefined ? base.cjk : { ...base.cjk, ...override.cjk },
  };
}

type GlyphPaintLayer = Exclude<VisualTextPaintLayer, { readonly kind: "box" }>;

function glyphPaintLayers(paints: readonly VisualTextPaintLayer[]): GlyphPaintLayer[] {
  return paints.filter((paint): paint is GlyphPaintLayer => paint.kind !== "box");
}

function inheritedGlyphColor(paints: readonly VisualTextPaintLayer[]): string[] {
  const fills = glyphPaintLayers(paints).filter((paint): paint is Extract<GlyphPaintLayer, { kind: "fill" }> => paint.kind === "fill");
  return fills.length === 1 && fills[0]!.paint.kind === "solid" ? [`color:${fills[0]!.paint.color}`] : [];
}

function glyphFilterId(
  paint: Extract<GlyphPaintLayer, { kind: "stroke" | "shadow" | "glow" }>,
  context: TextRenderContext,
): string {
  return context.stableId([context.trackId, context.presentId, "text-glyph-filter", digestOf(paint)]);
}

function glyphFilterDefinition(
  paint: Extract<GlyphPaintLayer, { kind: "stroke" | "shadow" | "glow" }>,
  context: TextRenderContext,
): string {
  const color = solidPaint(paint.paint);
  if (color === undefined) {
    throw new Error(`HyperFrames ${paint.kind} Text Paint requires solid color; materialize gradient ${paint.kind} as a Surface.`);
  }
  const id = glyphFilterId(paint, context);
  const flood = `<feFlood flood-color="${context.escape(color)}" result="paint"/>`;
  if (paint.kind === "stroke") {
    const radius = paint.placement === "center" ? paint.widthPx / 2 : paint.widthPx;
    const expanded = `<feMorphology in="SourceAlpha" operator="dilate" radius="${number(radius)}" result="expanded"/>`;
    const contracted = `<feMorphology in="SourceAlpha" operator="erode" radius="${number(radius)}" result="contracted"/>`;
    const ring = paint.placement === "outside"
      ? `<feComposite in="expanded" in2="SourceAlpha" operator="out" result="shape"/>`
      : paint.placement === "inside"
        ? `<feComposite in="SourceAlpha" in2="contracted" operator="out" result="shape"/>`
        : `<feComposite in="expanded" in2="contracted" operator="out" result="shape"/>`;
    return `<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">${expanded}${contracted}${ring}${flood}<feComposite in="paint" in2="shape" operator="in"/></filter>`;
  }
  const spread = paint.spreadPx <= 0
    ? `<feComposite in="SourceAlpha" in2="SourceAlpha" operator="in" result="spread"/>`
    : `<feMorphology in="SourceAlpha" operator="dilate" radius="${number(paint.spreadPx)}" result="spread"/>`;
  const blur = `<feGaussianBlur in="spread" stdDeviation="${number(paint.blurPx)}" result="blurred"/>`;
  const offset = paint.kind === "shadow"
    ? `<feOffset in="blurred" dx="${number(paint.offsetX)}" dy="${number(paint.offsetY)}" result="shape"/>`
    : `<feComposite in="blurred" in2="blurred" operator="in" result="shape"/>`;
  return `<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">${spread}${blur}${offset}${flood}<feComposite in="paint" in2="shape" operator="in"/></filter>`;
}

function glyphFilterDefinitions(element: TerminalTextElement, context: TextRenderContext): string {
  const layers: GlyphPaintLayer[] = [];
  const append = (paints: readonly VisualTextPaintLayer[] | undefined): void => {
    layers.push(...glyphPaintLayers(paints ?? []));
  };
  append(element.paints);
  for (const paragraph of element.document.paragraphs) {
    append(paragraph.style?.paints);
    for (const inline of paragraph.inlines) if (inline.kind === "text") append(inline.style?.paints);
  }
  const filtered = layers.filter((paint): paint is Extract<GlyphPaintLayer, { kind: "stroke" | "shadow" | "glow" }> => paint.kind !== "fill");
  const definitions = [...new Map(filtered.map((paint) => [digestOf(paint), paint])).values()]
    .map((paint) => glyphFilterDefinition(paint, context)).join("");
  return definitions;
}

function glyphPaintDefinitions(element: TerminalTextElement, context: TextRenderContext): string {
  const definitions = glyphFilterDefinitions(element, context);
  return definitions.length === 0 ? "" : `<svg aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden"><defs>${definitions}</defs></svg>`;
}

function glyphLayerCss(
  paint: GlyphPaintLayer,
  inheritSolidFill: boolean,
  context: TextRenderContext,
): string[] {
  const common = ["grid-area:1/1", "position:relative", "pointer-events:none"];
  if (paint.kind === "fill") {
    if (paint.paint.kind === "solid") return [...common, `color:${inheritSolidFill ? "inherit" : paint.paint.color}`];
    return [
      ...common,
      `background-image:${colorPaintCss(paint.paint)}`,
      "background-clip:text",
      "-webkit-background-clip:text",
      "color:transparent",
      "-webkit-text-fill-color:transparent",
    ];
  }
  return [
    ...common,
    "color:#ffffff",
    "-webkit-text-fill-color:#ffffff",
    `filter:url(#${glyphFilterId(paint, context)})`,
  ];
}

function renderGlyphPaint(
  value: string,
  paints: readonly VisualTextPaintLayer[],
  context: TextRenderContext,
): string {
  const layers = glyphPaintLayers(paints);
  if (layers.length === 0) return context.escape(value);
  const singleSolidFill = layers.length === 1 && layers[0]?.kind === "fill" && layers[0].paint.kind === "solid";
  return layers.map((paint, index) => `<span aria-hidden="${index === layers.length - 1 ? "false" : "true"}" data-svml-text-paint-layer="${index}"${styleAttribute(glyphLayerCss(paint, singleSolidFill, context), context.escape)}>${context.escape(value)}</span>`).join("");
}

function boxLayers(
  paints: readonly VisualTextPaintLayer[],
  target: Extract<VisualTextPaintLayer, { kind: "box" }>["target"],
  continuity?: "isolated" | "joined",
): Array<Extract<VisualTextPaintLayer, { kind: "box" }>> {
  return paints.filter((paint): paint is Extract<VisualTextPaintLayer, { kind: "box" }> =>
    paint.kind === "box" && paint.target === target && (continuity === undefined || paint.continuity === continuity));
}

function boxCss(
  paints: readonly VisualTextPaintLayer[],
  target: Extract<VisualTextPaintLayer, { kind: "box" }>["target"],
  continuity?: "isolated" | "joined",
): string[] {
  const layers = boxLayers(paints, target, continuity);
  if (layers.length === 0) return [];
  const result: string[] = [];
  const shadows: string[] = [];
  const backgrounds: string[] = [];
  for (const layer of layers) {
    const decoration = layer.decoration;
    if (decoration.fill !== undefined) {
      backgrounds.push(decoration.fill.kind === "solid"
        ? `linear-gradient(${decoration.fill.color},${decoration.fill.color})`
        : colorPaintCss(decoration.fill));
    }
    if (decoration.border !== undefined) {
      const color = solidPaint(decoration.border.paint);
      if (color === undefined) throw new Error("HyperFrames Text Box borders require solid Paint.");
      result.push(
        `border-style:${decoration.border.style}`,
        `border-color:${color}`,
        `border-width:${number(decoration.border.widthsPx.top)}px ${number(decoration.border.widthsPx.right)}px ${number(decoration.border.widthsPx.bottom)}px ${number(decoration.border.widthsPx.left)}px`,
      );
    }
    result.push(
      `padding:${number(decoration.paddingPx.top)}px ${number(decoration.paddingPx.right)}px ${number(decoration.paddingPx.bottom)}px ${number(decoration.paddingPx.left)}px`,
      `border-radius:${number(decoration.radiiPx.topLeft)}px ${number(decoration.radiiPx.topRight)}px ${number(decoration.radiiPx.bottomRight)}px ${number(decoration.radiiPx.bottomLeft)}px`,
    );
    for (const shadow of decoration.shadows) {
      const color = solidPaint(shadow.paint);
      if (color === undefined) throw new Error("HyperFrames Text Box shadows require solid Paint.");
      shadows.push(`${number(shadow.offsetX)}px ${number(shadow.offsetY)}px ${number(shadow.blurPx)}px ${number(shadow.spreadPx)}px ${color}`);
    }
  }
  if (backgrounds.length > 0) result.push(`background-image:${backgrounds.reverse().join(",")}`);
  if (shadows.length > 0) result.push(`box-shadow:${shadows.join(",")}`);
  return result;
}

function tailHtml(
  paints: readonly VisualTextPaintLayer[],
  target: Extract<VisualTextPaintLayer, { kind: "box" }>["target"],
  context: TextRenderContext,
  continuity?: "isolated" | "joined",
): string {
  return boxLayers(paints, target, continuity).flatMap((layer, index) => {
    const tail = layer.decoration.tail;
    if (tail === undefined) return [];
    const side = tail.side;
    const position = side === "top"
      ? `left:${number(tail.offset)}px;top:${number(-tail.heightPx)}px`
      : side === "bottom"
        ? `left:${number(tail.offset)}px;bottom:${number(-tail.heightPx)}px`
        : side === "left"
          ? `left:${number(-tail.widthPx)}px;top:${number(tail.offset)}px`
          : `right:${number(-tail.widthPx)}px;top:${number(tail.offset)}px`;
    const polygon = side === "top" ? "0 100%,50% 0,100% 100%"
      : side === "bottom" ? "0 0,100% 0,50% 100%"
        : side === "left" ? "100% 0,0 50%,100% 100%" : "0 0,100% 50%,0 100%";
    const style = `position:absolute;pointer-events:none;width:${number(tail.widthPx)}px;height:${number(tail.heightPx)}px;${position};background:${colorPaintCss(tail.paint)};clip-path:polygon(${polygon});z-index:${index}`;
    return [`<span aria-hidden="true" data-svml-text-tail="${side}" style="${context.escape(style)}"></span>`];
  }).join("");
}

function flowCss(element: VisualTextFlowElement): string[] {
  const flow = element.flow;
  const overflow = flow.overflow === "visible" ? "visible" : "hidden";
  const align = flow.inlineAlign === "start" ? "start" : flow.inlineAlign === "end" ? "end" : flow.inlineAlign;
  return [
    "box-sizing:border-box",
    `padding:${number(flow.paddingPx.blockStart)}px ${number(flow.paddingPx.inlineEnd)}px ${number(flow.paddingPx.blockEnd)}px ${number(flow.paddingPx.inlineStart)}px`,
    `text-align:${align}`,
    `overflow:${overflow}`,
    `white-space:${flow.wrap === "none" ? "pre" : "pre-wrap"}`,
    `overflow-wrap:${flow.wrap === "grapheme" ? "anywhere" : flow.wrap === "word" ? "break-word" : "normal"}`,
    `word-break:${flow.wrap === "grapheme" ? "break-all" : "normal"}`,
    `column-count:${flow.columns}`,
    `column-gap:${number(flow.columnGapPx)}px`,
    ...(flow.inlineSize === "hug" ? ["width:max-content"] : ["width:100%"]),
    ...(flow.blockSize === "hug" ? ["height:max-content"] : ["height:100%"]),
    ...(flow.overflow !== "ellipsis" || flow.wrap === "none" ? [] : [
      "display:-webkit-box",
      "-webkit-box-orient:vertical",
      ...(flow.maxLines === undefined ? [] : [`-webkit-line-clamp:${flow.maxLines}`]),
    ]),
    ...(flow.overflow === "ellipsis" && flow.wrap === "none" ? ["text-overflow:ellipsis"] : []),
    ...(flow.metricEdge === "line-box" ? [] : [
      "text-box-trim:trim-both",
      `text-box-edge:${flow.metricEdge === "cap-height" ? "cap alphabetic" : "text alphabetic"}`,
    ]),
  ];
}

type UnitIndices = {
  paragraph: number;
  run: number;
  word: number;
  grapheme: number;
};

function unitAnimationCss(
  _element: TerminalTextElement,
  _unit: VisualTextSequenceAnimation["unit"],
  _index: number,
  _context: TextRenderContext,
): string[] {
  // Unit-local animation is installed once as typed WAAPI keyframes after
  // exact-font layout. HyperFrames owns the frame clock and seeks those
  // persistent animations; no renderer script samples wall time.
  return [];
}

function styleAttribute(values: readonly string[], escape: TextRenderContext["escape"]): string {
  return values.length === 0 ? "" : ` style="${escape(values.join(";"))}"`;
}

function segmentRun(text: string, language: string | undefined): Array<{ text: string; wordLike: boolean }> {
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  return [...segmenter.segment(text)].map((segment) => ({ text: segment.segment, wordLike: segment.isWordLike ?? false }));
}

function graphemes(text: string, language: string | undefined): string[] {
  return [...new Intl.Segmenter(language, { granularity: "grapheme" }).segment(text)].map((segment) => segment.segment);
}

function textUnitCounts(document: VisualTextDocument, typography: VisualTextTypography): Record<"paragraph" | "run" | "word" | "grapheme", number> {
  const result = { paragraph: document.paragraphs.length, run: 0, word: 0, grapheme: 0 };
  for (const paragraph of document.paragraphs) {
    const paragraphTypography = mergedTypography(typography, paragraph.style);
    for (const inline of paragraph.inlines) {
      if (inline.kind === "break") continue;
      result.run += 1;
      const runTypography = mergedTypography(paragraphTypography, inline.style);
      const language = inline.language ?? runTypography.language;
      for (const segment of segmentRun(inline.text, language)) {
        if (segment.wordLike) result.word += 1;
        result.grapheme += graphemes(segment.text, language).length;
      }
    }
  }
  return result;
}

function assertTextUnitRanges(element: TerminalTextElement): void {
  const counts = textUnitCounts(element.document, element.typography);
  for (const sequence of element.sequences) {
    if (sequence.unit !== "line" && sequence.range.endExclusive > counts[sequence.unit]) {
      throw new Error(`Text sequence ${sequence.id} selects ${sequence.unit} ${sequence.range.endExclusive}, but only ${counts[sequence.unit]} exist.`);
    }
  }
}

function renderDocument(
  document: VisualTextDocument,
  element: TerminalTextElement,
  context: TextRenderContext,
): string {
  const indices: UnitIndices = { paragraph: 0, run: 0, word: 0, grapheme: 0 };
  const renderGrapheme = (value: string, paints: readonly VisualTextPaintLayer[]): string => {
    const graphemeIndex = indices.grapheme++;
    const styles = [
      "position:relative",
      "display:inline-grid",
      ...boxCss(paints, "grapheme", "isolated"),
      ...unitAnimationCss(element, "grapheme", graphemeIndex, context),
    ];
    return `<span data-svml-text-unit-grapheme="${graphemeIndex}"${styleAttribute(styles, context.escape)}>${tailHtml(paints, "grapheme", context, "isolated")}${renderGlyphPaint(value, paints, context)}</span>`;
  };
  return document.paragraphs.map((paragraph) => {
    const paragraphIndex = indices.paragraph++;
    const paragraphTypography = mergedTypography(element.typography, paragraph.style);
    const paragraphPaints = paragraph.style?.paints ?? element.paints;
    const content = paragraph.inlines.map((inline) => {
      if (inline.kind === "break") return "<br/>";
      const runIndex = indices.run++;
      const typography = mergedTypography(paragraphTypography, inline.style);
      const paints = inline.style?.paints ?? paragraphPaints;
      const runContents = segmentRun(inline.text, inline.language ?? typography.language).map((segment) => {
        if (!segment.wordLike) {
          return graphemes(segment.text, inline.language ?? typography.language).map((grapheme) => renderGrapheme(grapheme, paints)).join("");
        }
        const wordIndex = indices.word++;
        const wordContent = graphemes(segment.text, inline.language ?? typography.language).map((grapheme) => renderGrapheme(grapheme, paints)).join("");
        return `<span data-svml-text-unit-word="${wordIndex}"${styleAttribute([
          "position:relative",
          ...boxCss(paints, "word", "isolated"),
          ...unitAnimationCss(element, "word", wordIndex, context),
        ], context.escape)}>${tailHtml(paints, "word", context, "isolated")}${wordContent}</span>`;
      }).join("");
      const runStyle = [
        "position:relative",
        "box-decoration-break:clone",
        "-webkit-box-decoration-break:clone",
        ...typographyCss(typography, context.exactFontFamily),
        ...inheritedGlyphColor(paints),
        ...boxCss(paints, "run"),
        ...boxCss(paints, "word", "joined"),
        ...boxCss(paints, "grapheme", "joined"),
        ...unitAnimationCss(element, "run", runIndex, context),
      ];
      return `<span data-svml-text-run="${context.escape(inline.id)}" data-svml-text-unit-run="${runIndex}" ${textLanguageAttributes(typography, context.escape, inline.language, inline.direction)}${styleAttribute(runStyle, context.escape)}>${tailHtml(paints, "run", context)}${tailHtml(paints, "word", context, "joined")}${tailHtml(paints, "grapheme", context, "joined")}${runContents}</span>`;
    }).join("");
    const paragraphStyle = [
      "position:relative",
      `margin:${number(paragraphTypography.paragraphBeforePx)}px 0 ${number(paragraphTypography.paragraphAfterPx)}px 0`,
      ...boxCss(paragraphPaints, "paragraph"),
      ...unitAnimationCss(element, "paragraph", paragraphIndex, context),
    ];
    return `<div data-svml-text-paragraph="${context.escape(paragraph.id)}" data-svml-text-unit-paragraph="${paragraphIndex}" ${textLanguageAttributes(paragraphTypography, context.escape)}${styleAttribute(paragraphStyle, context.escape)}>${tailHtml(paragraphPaints, "paragraph", context)}<span data-svml-text-line-fragments${styleAttribute([
      "position:relative",
      "box-decoration-break:clone",
      "-webkit-box-decoration-break:clone",
      ...boxCss(paragraphPaints, "line"),
    ], context.escape)}>${tailHtml(paragraphPaints, "line", context)}${content}</span></div>`;
  }).join("");
}

function pathData(commands: readonly VisualVectorPathCommand[]): string {
  return commands.map((command) => {
    if (command.kind === "move") return `M ${number(command.x)} ${number(command.y)}`;
    if (command.kind === "line") return `L ${number(command.x)} ${number(command.y)}`;
    if (command.kind === "quadratic") return `Q ${number(command.controlX)} ${number(command.controlY)} ${number(command.x)} ${number(command.y)}`;
    if (command.kind === "cubic") return `C ${number(command.control1X)} ${number(command.control1Y)} ${number(command.control2X)} ${number(command.control2Y)} ${number(command.x)} ${number(command.y)}`;
    return "Z";
  }).join(" ");
}

type PathSegment = (
  | { readonly kind: "line"; readonly x: number; readonly y: number }
  | { readonly kind: "quadratic"; readonly controlX: number; readonly controlY: number; readonly x: number; readonly y: number }
  | { readonly kind: "cubic"; readonly control1X: number; readonly control1Y: number; readonly control2X: number; readonly control2Y: number; readonly x: number; readonly y: number }
) & { readonly from: { readonly x: number; readonly y: number } };

function reversePath(commands: readonly VisualVectorPathCommand[]): VisualVectorPathCommand[] {
  const result: VisualVectorPathCommand[] = [];
  let start: { x: number; y: number } | undefined;
  let current: { x: number; y: number } | undefined;
  let segments: PathSegment[] = [];
  let closed = false;
  const flush = (): void => {
    if (start === undefined || current === undefined) return;
    const reversed = [...segments].reverse();
    result.push({ kind: "move", x: current.x, y: current.y });
    for (const segment of reversed) {
      if (segment.kind === "line") result.push({ kind: "line", x: segment.from.x, y: segment.from.y });
      else if (segment.kind === "quadratic") result.push({ kind: "quadratic", controlX: segment.controlX, controlY: segment.controlY, x: segment.from.x, y: segment.from.y });
      else result.push({
        kind: "cubic", control1X: segment.control2X, control1Y: segment.control2Y,
        control2X: segment.control1X, control2Y: segment.control1Y, x: segment.from.x, y: segment.from.y,
      });
    }
    if (closed) result.push({ kind: "close" });
    start = undefined; current = undefined; segments = []; closed = false;
  };
  for (const command of commands) {
    if (command.kind === "move") {
      flush();
      start = { x: command.x, y: command.y };
      current = start;
    } else if (command.kind === "close") {
      if (start === undefined || current === undefined) throw new Error("Path close has no open subpath.");
      if (current.x !== start.x || current.y !== start.y) segments.push({ kind: "line", from: current, x: start.x, y: start.y });
      current = start;
      closed = true;
    } else {
      if (current === undefined) throw new Error("Path segment has no current point.");
      if (command.kind === "line") segments.push({ kind: "line", x: command.x, y: command.y, from: current });
      else if (command.kind === "quadratic") segments.push({ ...command, from: current });
      else if (command.kind === "cubic") segments.push({ ...command, from: current });
      else throw new Error("Path segment is unsupported.");
      current = { x: command.x, y: command.y };
    }
  }
  flush();
  return result;
}

function allDocumentPaints(element: TerminalTextElement): VisualColorPaint[] {
  const result: VisualColorPaint[] = [];
  const append = (paints: readonly VisualTextPaintLayer[] | undefined): void => {
    for (const layer of paints ?? []) {
      if (layer.kind === "box") {
        if (layer.decoration.fill !== undefined) result.push(layer.decoration.fill);
        if (layer.decoration.border !== undefined) result.push(layer.decoration.border.paint);
      } else result.push(layer.paint);
    }
  };
  append(element.paints);
  for (const paragraph of element.document.paragraphs) {
    append(paragraph.style?.paints);
    for (const inline of paragraph.inlines) if (inline.kind === "text") append(inline.style?.paints);
  }
  return [...new Map(result.map((paint) => [digestOf(paint), paint])).values()];
}

function svgPaintId(paint: VisualColorPaint, context: TextRenderContext): string {
  return context.stableId([context.trackId, context.presentId, "text-paint", digestOf(paint)]);
}

function svgPaintValue(paint: VisualColorPaint, context: TextRenderContext): string {
  return paint.kind === "solid" ? paint.color : `url(#${svgPaintId(paint, context)})`;
}

function svgPaintDefinitions(element: TerminalTextElement, context: TextRenderContext): string {
  return allDocumentPaints(element).flatMap((paint) => {
    if (paint.kind === "solid") return [];
    const stops = paint.stops.map((stop) => `<stop offset="${number(stop.offset * 100)}%" stop-color="${context.escape(stop.color)}" stop-opacity="${number(stop.opacity)}"/>`).join("");
    const id = svgPaintId(paint, context);
    if (paint.kind === "radial-gradient") {
      return [`<radialGradient id="${id}" cx="${number(paint.center.x * 100)}%" cy="${number(paint.center.y * 100)}%" r="70.710678%">${stops}</radialGradient>`];
    }
    const radians = (paint.angleDeg - 90) * Math.PI / 180;
    const x = Math.cos(radians) * 50;
    const y = Math.sin(radians) * 50;
    return [`<linearGradient id="${id}" x1="${number(50 - x)}%" y1="${number(50 - y)}%" x2="${number(50 + x)}%" y2="${number(50 + y)}%">${stops}</linearGradient>`];
  }).join("");
}

function svgGlyphLayerCss(paint: GlyphPaintLayer | undefined, context: TextRenderContext): string[] {
  if (paint === undefined) return ["fill:transparent", "stroke:none", "filter:none"];
  if (paint.kind === "fill") return [`fill:${svgPaintValue(paint.paint, context)}`, "stroke:none", "filter:none"];
  // The same morphology/filter definition used by flow Text gives Path Text
  // exact inside/center/outside rings, spread, blur and ordered effects. A
  // gradient effect is deliberately materialized rather than approximated.
  glyphFilterDefinition(paint, context);
  return ["fill:#ffffff", "stroke:none", `filter:url(#${glyphFilterId(paint, context)})`];
}

function pathPaintLayerCount(element: VisualPathTextElement): number {
  let count = glyphPaintLayers(element.paints).length;
  const inspect = (paints: readonly VisualTextPaintLayer[] | undefined): void => {
    for (const paint of paints ?? []) {
      if (paint.kind === "box") {
        throw new Error("HyperFrames Path Text requires Box Paint to be materialized by its owning package.");
      }
    }
    count = Math.max(count, glyphPaintLayers(paints ?? []).length);
  };
  inspect(element.paints);
  for (const paragraph of element.document.paragraphs) {
    inspect(paragraph.style?.paints);
    for (const inline of paragraph.inlines) if (inline.kind === "text") inspect(inline.style?.paints);
  }
  return Math.max(1, count);
}

function renderPathDocument(element: VisualPathTextElement, context: TextRenderContext, layerIndex: number): string {
  const indices: UnitIndices = { paragraph: 0, run: 0, word: 0, grapheme: 0 };
  return element.document.paragraphs.map((paragraph, paragraphPosition) => {
    const paragraphIndex = indices.paragraph++;
    const paragraphTypography = mergedTypography(element.typography, paragraph.style);
    const paragraphPaints = paragraph.style?.paints ?? element.paints;
    const content = paragraph.inlines.map((inline) => {
      if (inline.kind === "break") return " ";
      const runIndex = indices.run++;
      const typography = mergedTypography(paragraphTypography, inline.style);
      const paints = inline.style?.paints ?? paragraphPaints;
      const paint = glyphPaintLayers(paints)[layerIndex];
      const text = segmentRun(inline.text, inline.language ?? typography.language).map((segment) => {
        if (!segment.wordLike) return graphemes(segment.text, inline.language ?? typography.language).map((value) => {
          const index = indices.grapheme++;
          return `<tspan data-svml-text-unit-grapheme="${index}"${styleAttribute(unitAnimationCss(element, "grapheme", index, context), context.escape)}>${context.escape(value)}</tspan>`;
        }).join("");
        const word = indices.word++;
        const value = graphemes(segment.text, inline.language ?? typography.language).map((item) => {
          const index = indices.grapheme++;
          return `<tspan data-svml-text-unit-grapheme="${index}"${styleAttribute(unitAnimationCss(element, "grapheme", index, context), context.escape)}>${context.escape(item)}</tspan>`;
        }).join("");
        return `<tspan data-svml-text-unit-word="${word}"${styleAttribute(unitAnimationCss(element, "word", word, context), context.escape)}>${value}</tspan>`;
      }).join("");
      const style = [...typographyCss(typography, context.exactFontFamily), ...svgGlyphLayerCss(paint, context), ...unitAnimationCss(element, "run", runIndex, context)];
      return `<tspan data-svml-text-unit-run="${runIndex}" ${textLanguageAttributes(typography, context.escape, inline.language, inline.direction)}${styleAttribute(style, context.escape)}>${text}</tspan>`;
    }).join("");
    const separator = paragraphPosition === 0 ? "" : " ";
    return `${separator}<tspan data-svml-text-unit-paragraph="${paragraphIndex}"${styleAttribute(unitAnimationCss(element, "paragraph", paragraphIndex, context), context.escape)}>${content}</tspan>`;
  }).join("");
}

export function renderTerminalTextElement(element: TerminalTextElement, context: TextRenderContext): string {
  assertTextUnitRanges(element);
  const clockAttributes = `data-svml-text-clock data-svml-text-start-frame="${context.presentStartFrame}" data-svml-text-frame-numerator="${context.programNumerator}" data-svml-text-frame-denominator="${context.programDenominator}"`;
  const sequenceAttributes = element.sequences.length === 0 ? "" : ` data-svml-text-sequences="${context.escape(JSON.stringify(element.sequences))}" data-svml-text-duration-frames="${context.durationFrames}"`;
  if (element.kind === "path-text") {
    const pathId = context.stableId([context.trackId, context.presentId, element.id, "path"]);
    const anchor = element.align === "start" ? "start" : element.align === "end" ? "end" : "middle";
    const offset = element.marginAnimation?.keyframes[0]?.startMarginPx
      ?? (element.align === "start" ? element.startMarginPx : element.align === "end" ? "100%" : "50%");
    const placementData = element.marginAnimation === undefined
      ? ` data-svml-text-path-placement="${context.escape(JSON.stringify({
        align: element.align, startMarginPx: element.startMarginPx, endMarginPx: element.endMarginPx,
      }))}"`
      : ` data-svml-text-path-margin="${context.escape(JSON.stringify({
        startFrame: context.presentStartFrame,
        numerator: context.programNumerator,
        denominator: context.programDenominator,
        align: element.align,
        endMarginPx: element.endMarginPx,
        keyframes: element.marginAnimation.keyframes,
      }))}"`;
    const layerCount = pathPaintLayerCount(element);
    const layers = Array.from({ length: layerCount }, (_, layerIndex) => {
      const textCss = [...typographyCss(element.typography, context.exactFontFamily), "fill:transparent", "stroke:none"].join(";");
      return `<text aria-hidden="${layerIndex === layerCount - 1 ? "false" : "true"}" data-svml-text-path-paint-layer="${layerIndex}" style="${context.escape(textCss)}" text-anchor="${anchor}" dominant-baseline="central"><textPath href="#${pathId}" startOffset="${typeof offset === "number" ? number(offset) : offset}" side="${element.side}"${placementData}${element.orientation === "upright" ? ' data-svml-text-path-upright="true"' : ""}>${renderPathDocument(element, context, layerIndex)}</textPath></text>`;
    }).join("");
    return `<svg ${context.commonAttributes} ${clockAttributes}${sequenceAttributes} ${textLanguageAttributes(element.typography, context.escape)} width="100%" height="100%" style="${context.escape(`${context.baseStyle};overflow:${element.overflow === "clip" ? "hidden" : "visible"}`)}"><defs><path id="${pathId}" d="${context.escape(pathData(element.reverse ? reversePath(element.path) : element.path))}"/>${svgPaintDefinitions(element, context)}${glyphFilterDefinitions(element, context)}</defs>${layers}</svg>`;
  }
  const rootStyle = [
    context.baseStyle,
    "display:flex",
    `align-items:${element.flow.blockAlign === "start" ? "flex-start" : element.flow.blockAlign === "end" ? "flex-end" : "center"}`,
    `justify-content:${element.flow.inlineAlign === "start" ? "flex-start" : element.flow.inlineAlign === "end" ? "flex-end" : "center"}`,
    ...(element.flow.clipToFrame ? ["overflow:hidden"] : []),
    ...boxCss(element.paints, "frame"),
  ];
  const contentStyle = [
    "position:relative",
    ...flowCss(element),
    ...typographyCss(element.typography, context.exactFontFamily),
    ...inheritedGlyphColor(element.paints),
    ...boxCss(element.paints, "content"),
  ];
  const lineSequences = element.sequences.filter((sequence) => sequence.unit === "line");
  const layoutData = [
    `data-svml-text-overflow="${element.flow.overflow}"`,
    `data-svml-text-writing-mode="${element.typography.writingMode}"`,
    ...(element.flow.minimumScale === undefined ? [] : [`data-svml-text-minimum-scale="${number(element.flow.minimumScale)}"`]),
    ...(element.flow.maxLines === undefined ? [] : [`data-svml-text-max-lines="${element.flow.maxLines}"`]),
  ].join(" ");
  const lineData = lineSequences.length === 0 ? "" : ` data-svml-text-line-sequences="${context.escape(JSON.stringify(lineSequences))}"`;
  return `<div ${context.commonAttributes} ${clockAttributes}${sequenceAttributes} ${textLanguageAttributes(element.typography, context.escape)} style="${context.escape(rootStyle.join(";"))}">${glyphPaintDefinitions(element, context)}${tailHtml(element.paints, "frame", context)}<div data-svml-text-flow ${layoutData}${lineData}${styleAttribute(contentStyle, context.escape)}>${tailHtml(element.paints, "content", context)}${renderDocument(element.document, element, context)}</div></div>`;
}

export function collectTerminalTextFonts(element: TerminalTextElement): FontArtifactRef[] {
  const result: FontArtifactRef[] = [...(element.typography.fonts ?? [])];
  for (const paragraph of element.document.paragraphs) {
    result.push(...(paragraph.style?.typography?.fonts ?? []));
    for (const inline of paragraph.inlines) {
      if (inline.kind === "text") result.push(...(inline.style?.typography?.fonts ?? []));
    }
  }
  const unique = new Map(result.map((font) => [digestOf(font), font]));
  return [...unique.values()];
}

/** Renderer-owned deterministic post-layout step for physical-line selectors. */
export const terminalTextLayoutScript = String.raw`
const svmlTextEase = (name, value) => {
  if (name === 'ease-in') return value * value;
  if (name === 'ease-out') return 1 - (1 - value) * (1 - value);
  if (name === 'ease-in-out') return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
  return value;
};
const svmlUpdateUprightTextPaths = () => {
  for (const path of document.querySelectorAll('[data-svml-text-path-upright]')) {
    for (const glyph of path.querySelectorAll('[data-svml-text-unit-grapheme]')) {
      try {
        glyph.removeAttribute('rotate');
        const pathRotation = glyph.getRotationOfChar(0);
        glyph.setAttribute('rotate', String(-pathRotation));
      } catch (error) {
        throw new Error('Upright Path Text could not resolve exact glyph orientation.', { cause: error });
      }
    }
  }
};
const svmlUpdateStaticTextPathPlacements = () => {
  for (const textPath of document.querySelectorAll('[data-svml-text-path-placement]')) {
    const data = JSON.parse(textPath.getAttribute('data-svml-text-path-placement'));
    const href = textPath.getAttribute('href');
    const path = href && document.getElementById(href.slice(1));
    if (!path || typeof path.getTotalLength !== 'function') throw new Error('Path Text cannot resolve its owned vector path.');
    const length = path.getTotalLength();
    const start = data.startMarginPx;
    const end = length - data.endMarginPx;
    if (end < start) throw new Error('Path Text margins exceed the owned path length.');
    textPath.setAttribute('startOffset', String(data.align === 'start' ? start : data.align === 'end' ? end : (start + end) / 2));
  }
};
const svmlUpdateTextPathMargins = (time) => {
  for (const path of document.querySelectorAll('[data-svml-text-path-margin]')) {
    const data = JSON.parse(path.getAttribute('data-svml-text-path-margin'));
    const frames = data.keyframes;
    // HyperFrames may reach the same source frame through an incremental seek
    // or a fresh worker seek. Quantize the absolute clock back to the authored
    // integer frame before evaluating package-owned motion so both routes are
    // byte-identical.
    const local = Math.round(time * data.numerator / data.denominator - data.startFrame);
    let value = frames[0].startMarginPx;
    if (local >= frames[frames.length - 1].atFrame) value = frames[frames.length - 1].startMarginPx;
    else {
      for (let index = 0; index < frames.length - 1; index += 1) {
        const left = frames[index];
        const right = frames[index + 1];
        if (local < left.atFrame || local > right.atFrame) continue;
        const progress = svmlTextEase(left.easing || 'linear', (local - left.atFrame) / (right.atFrame - left.atFrame));
        value = left.startMarginPx + (right.startMarginPx - left.startMarginPx) * progress;
        break;
      }
    }
    const href = path.getAttribute('href');
    const geometry = href && document.getElementById(href.slice(1));
    if (!geometry || typeof geometry.getTotalLength !== 'function') throw new Error('Animated Path Text cannot resolve its owned vector path.');
    const end = geometry.getTotalLength() - data.endMarginPx;
    if (end < value) throw new Error('Animated Path Text margins exceed the owned path length.');
    path.setAttribute('startOffset', String(data.align === 'start' ? value : data.align === 'end' ? end : (value + end) / 2));
  }
  svmlUpdateUprightTextPaths();
};
const svmlTextUnitBaseStyles = new WeakMap();
const svmlTextAnimatedStyleNames = ['-webkit-text-fill-color', '-webkit-text-stroke-color', 'background-color', 'color', 'filter', 'opacity', 'transform'];
const svmlTextPropertyName = (name) => {
  if (name === '-webkit-text-fill-color') return 'webkitTextFillColor';
  if (name === '-webkit-text-stroke-color') return 'webkitTextStrokeColor';
  if (name === 'background-color') return 'backgroundColor';
  return name;
};
const svmlTextSeededOrder = (length, seed) => {
  const result = Array.from({ length }, (_, index) => index);
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const selected = state % (index + 1);
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
};
const svmlTextSequenceRank = (sequence, index) => {
  if (index < sequence.range.start || index >= sequence.range.endExclusive) return null;
  const length = sequence.range.endExclusive - sequence.range.start;
  const local = index - sequence.range.start;
  if (sequence.order === 'forward') return local;
  if (sequence.order === 'reverse') return length - 1 - local;
  return svmlTextSeededOrder(length, sequence.seed || 0).indexOf(local);
};
const svmlTextSequenceClock = (sequence, rank, frame) => {
  const start = sequence.startFrame + rank * sequence.staggerFrames;
  const end = start + sequence.unitDurationFrames * sequence.cycles;
  if (frame <= start) return 0;
  if (frame >= end) return sequence.unitDurationFrames;
  // Every cycle is a half-open interval. At an exact cycle boundary the next
  // cycle begins at progress zero; the result therefore depends only on this
  // absolute authored frame, never on which partition rendered the previous
  // frame. A repeated keyframe-offset list cannot express that law reliably
  // across fresh and incrementally-seeked browser animation instances.
  return (frame - start) % sequence.unitDurationFrames;
};
const svmlTextSequenceProgress = (sequence, clock) => {
  const progress = clock / sequence.unitDurationFrames;
  let left = sequence.keyframes[0];
  let right = sequence.keyframes[sequence.keyframes.length - 1];
  for (let index = 0; index < sequence.keyframes.length - 1; index += 1) {
    if (progress < sequence.keyframes[index].atProgress || progress > sequence.keyframes[index + 1].atProgress) continue;
    left = sequence.keyframes[index];
    right = sequence.keyframes[index + 1];
    break;
  }
  const width = right.atProgress - left.atProgress;
  return {
    left,
    right,
    progress: svmlTextEase(left.easing || 'linear', width <= 0 ? 1 : (progress - left.atProgress) / width),
  };
};
const svmlSeekTextUnitAnimations = (time) => {
  const unitSelector = '[data-svml-text-unit-paragraph],[data-svml-text-unit-run],[data-svml-text-unit-word],[data-svml-text-unit-grapheme]';
  for (const root of document.querySelectorAll('[data-svml-text-clock][data-svml-text-sequences]')) {
    const startFrame = Number(root.getAttribute('data-svml-text-start-frame'));
    const numerator = Number(root.getAttribute('data-svml-text-frame-numerator'));
    const denominator = Number(root.getAttribute('data-svml-text-frame-denominator'));
    const durationFrames = Number(root.getAttribute('data-svml-text-duration-frames'));
    if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)
      || !Number.isSafeInteger(durationFrames) || numerator <= 0 || denominator <= 0 || durationFrames <= 0) {
      throw new Error('Invalid terminal Text animation clock.');
    }
    const sequences = JSON.parse(root.getAttribute('data-svml-text-sequences') || '[]');
    const localFrame = Math.max(0, Math.min(durationFrames, Math.round(time * numerator / denominator - startFrame)));
    for (const unit of root.querySelectorAll(unitSelector)) {
      let base = svmlTextUnitBaseStyles.get(unit);
      if (!base) {
        base = Object.fromEntries(svmlTextAnimatedStyleNames.map((name) => [name, unit.style.getPropertyValue(name)]));
        svmlTextUnitBaseStyles.set(unit, base);
      }
      for (const name of svmlTextAnimatedStyleNames) {
        if (base[name]) unit.style.setProperty(name, base[name]);
        else unit.style.removeProperty(name);
      }
      for (const sequence of sequences) {
        const attribute = sequence.unit === 'line' ? 'data-svml-text-physical-line' : 'data-svml-text-unit-' + sequence.unit;
        if (!unit.hasAttribute(attribute)) continue;
        const index = Number(unit.getAttribute(attribute));
        const rank = Number.isSafeInteger(index) ? svmlTextSequenceRank(sequence, index) : null;
        if (rank === null) continue;
        const clock = svmlTextSequenceClock(sequence, rank, localFrame);
        const keyframes = sequence.keyframes.map((point) => {
          const frame = { offset: point.atProgress, ...(point.easing ? { easing: point.easing } : {}) };
          for (const declaration of point.style) frame[svmlTextPropertyName(declaration.name)] = declaration.value;
          return frame;
        });
        const nativeAnimate = Element.prototype.__hfOriginalAnimate;
        const animation = typeof nativeAnimate === 'function'
          ? nativeAnimate.call(unit, keyframes, { duration: sequence.unitDurationFrames, fill: 'both', iterations: 1 })
          : unit.animate(keyframes, { duration: sequence.unitDurationFrames, fill: 'both', iterations: 1 });
        animation.pause();
        animation.currentTime = clock;
        const animatedNames = [...new Set(sequence.keyframes.flatMap((keyframe) => keyframe.style.map((declaration) => declaration.name)))];
        const computed = getComputedStyle(unit);
        const sampled = Object.fromEntries(animatedNames.map((name) => [name, computed.getPropertyValue(name)]));
        animation.cancel();
        if (animatedNames.includes('opacity')) {
          const { left, right, progress } = svmlTextSequenceProgress(sequence, clock);
          const leftValue = left.style.find((declaration) => declaration.name === 'opacity')?.value;
          const rightValue = right.style.find((declaration) => declaration.name === 'opacity')?.value;
          if (typeof leftValue === 'number' && typeof rightValue === 'number') sampled.opacity = String(leftValue + (rightValue - leftValue) * progress);
        }
        for (const name of animatedNames) unit.style.setProperty(name, sampled[name]);
      }
    }
  }
};
const svmlTextComposition = document.querySelector('[data-composition-id]');
if (!svmlTextComposition) throw new Error('Terminal Text could not resolve the containing HyperFrames composition.');
const svmlTextCompositionId = svmlTextComposition.getAttribute('data-composition-id');
if (!svmlTextCompositionId) throw new Error('Terminal Text composition identity is empty.');
let svmlTextAbsoluteTime = 0;
let svmlTextReady = false;
const svmlTextTimeline = {
  pause() { return this; },
  seek(time) { return this.totalTime(time); },
  totalTime(time) {
    if (time === undefined) return svmlTextAbsoluteTime;
    // Register and remember seeks synchronously, even while exact fonts are
    // still loading. A worker may begin at any frame; once layout becomes
    // ready the latest requested absolute frame is evaluated exactly once.
    svmlTextAbsoluteTime = Math.max(0, Number(time) || 0);
    if (svmlTextReady) {
      svmlSeekTextUnitAnimations(svmlTextAbsoluteTime);
      svmlUpdateTextPathMargins(svmlTextAbsoluteTime);
      // Attribute changes on SVG text paths and browser text layout are
      // sampled synchronously for the exact authored frame. Do not wait for a
      // requestAnimationFrame from HyperFrames' seek barrier: capture is
      // paused behind that barrier, so doing so would deadlock both clocks.
      document.documentElement.getBoundingClientRect();
    }
    return this;
  },
};
window.__timelines = window.__timelines || {};
window.__timelines[svmlTextCompositionId] = svmlTextTimeline;
if (typeof window.__hfForceTimelineRebind === 'function') window.__hfForceTimelineRebind();
const svmlTextLayoutReady = document.fonts.ready.then(() => {
  svmlUpdateStaticTextPathPlacements();
  svmlUpdateUprightTextPaths();
  const physicalLines = (flow) => {
    const values = [];
    const vertical = flow.getAttribute('data-svml-text-writing-mode') !== 'horizontal-tb';
    for (const glyph of flow.querySelectorAll('[data-svml-text-unit-grapheme]')) {
      const rect = glyph.getBoundingClientRect();
      const axis = vertical ? rect.left : rect.top;
      if (!values.some((value) => Math.abs(value - axis) < 0.5)) values.push(axis);
    }
    return values;
  };
  for (const flow of document.querySelectorAll('[data-svml-text-flow][data-svml-text-overflow="ellipsis"]')) {
    if (flow.getAttribute('data-svml-text-max-lines') || getComputedStyle(flow).whiteSpace === 'pre') continue;
    const parent = flow.parentElement;
    if (!parent) throw new Error('Ellipsis Text has no placement frame.');
    const vertical = flow.getAttribute('data-svml-text-writing-mode') !== 'horizontal-tb';
    const boundary = parent.getBoundingClientRect();
    const groups = [];
    for (const glyph of flow.querySelectorAll('[data-svml-text-unit-grapheme]')) {
      const rect = glyph.getBoundingClientRect();
      const axis = vertical ? rect.left : rect.top;
      let group = groups.find((item) => Math.abs(item.axis - axis) < 0.5);
      if (!group) { group = { axis, rects: [] }; groups.push(group); }
      group.rects.push(rect);
    }
    const visible = groups.filter((group) => group.rects.some((rect) => vertical
      ? rect.left >= boundary.left - 0.5 && rect.right <= boundary.right + 0.5
      : rect.top >= boundary.top - 0.5 && rect.bottom <= boundary.bottom + 0.5)).length;
    flow.style.webkitLineClamp = String(Math.max(1, visible));
  }
  for (const flow of document.querySelectorAll('[data-svml-text-flow][data-svml-text-overflow="shrink"]')) {
    const minimum = Number(flow.getAttribute('data-svml-text-minimum-scale'));
    const maximumLines = Number(flow.getAttribute('data-svml-text-max-lines') || '0');
    const parent = flow.parentElement;
    if (!parent || !Number.isFinite(minimum) || minimum <= 0 || minimum > 1) throw new Error('Invalid bounded Text shrink request.');
    const availableWidth = parent.clientWidth;
    const availableHeight = parent.clientHeight;
    const apply = (scale) => {
      flow.style.position = 'absolute';
      flow.style.left = '0';
      flow.style.top = '0';
      flow.style.zoom = '';
      flow.style.transformOrigin = 'top left';
      flow.style.transform = 'scale(' + scale + ')';
      flow.style.width = String(100 / scale) + '%';
      flow.style.height = String(100 / scale) + '%';
    };
    const measure = (scale) => {
      apply(scale);
      const lines = physicalLines(flow).length;
      const boundary = parent.getBoundingClientRect();
      const glyphRects = [...flow.querySelectorAll('[data-svml-text-unit-grapheme]')]
        .map((glyph) => glyph.getBoundingClientRect());
      const left = glyphRects.length === 0 ? boundary.left : Math.min(...glyphRects.map((rect) => rect.left));
      const right = glyphRects.length === 0 ? boundary.left : Math.max(...glyphRects.map((rect) => rect.right));
      const top = glyphRects.length === 0 ? boundary.top : Math.min(...glyphRects.map((rect) => rect.top));
      const bottom = glyphRects.length === 0 ? boundary.top : Math.max(...glyphRects.map((rect) => rect.bottom));
      const width = right - left;
      const height = bottom - top;
      return {
        fits: left >= boundary.left - 0.5
          && right <= boundary.right + 0.5
          && top >= boundary.top - 0.5
          && bottom <= boundary.bottom + 0.5
          && (maximumLines === 0 || lines <= maximumLines),
        width, height, lines,
        offsets: {
          left: left - boundary.left,
          right: boundary.right - right,
          top: top - boundary.top,
          bottom: boundary.bottom - bottom,
        },
      };
    };
    const minimumMeasurement = measure(minimum);
    if (!minimumMeasurement.fits) throw new Error('Text cannot fit at its authored minimum scale: '
      + minimumMeasurement.width.toFixed(2) + 'x' + minimumMeasurement.height.toFixed(2)
      + ' in ' + availableWidth + 'x' + availableHeight + ', lines=' + minimumMeasurement.lines
      + ', offsets=' + JSON.stringify(minimumMeasurement.offsets)
      + (maximumLines === 0 ? '' : ', maxLines=' + maximumLines) + '.');
    let low = minimum;
    let high = 1;
    for (let index = 0; index < 20; index += 1) {
      const middle = (low + high) / 2;
      if (measure(middle).fits) low = middle;
      else high = middle;
    }
    apply(low);
    flow.setAttribute('data-svml-text-shrink-scale', low.toFixed(8));
  }
  for (const flow of document.querySelectorAll('[data-svml-text-flow][data-svml-text-line-sequences]')) {
    const sequences = JSON.parse(flow.getAttribute('data-svml-text-line-sequences') || '[]');
    const glyphs = [...flow.querySelectorAll('[data-svml-text-unit-grapheme]')];
    const vertical = flow.getAttribute('data-svml-text-writing-mode') !== 'horizontal-tb';
    const axes = [];
    const lineOf = new Map();
    for (const glyph of glyphs) {
      const rect = glyph.getBoundingClientRect();
      const axis = vertical ? rect.left : rect.top;
      let line = axes.findIndex((value) => Math.abs(value - axis) < 0.5);
      if (line < 0) { line = axes.length; axes.push(axis); }
      lineOf.set(glyph, line);
    }
    for (const sequence of sequences) {
      if (sequence.range.endExclusive > axes.length) throw new Error('Text line sequence selects a line that does not exist.');
    }
    for (let line = 0; line < axes.length; line += 1) {
      const members = glyphs.filter((glyph) => lineOf.get(glyph) === line);
      const rects = members.map((glyph) => glyph.getBoundingClientRect());
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      for (const [memberIndex, glyph] of members.entries()) {
        const rect = rects[memberIndex];
        glyph.style.transformOrigin = String((left + right) / 2 - rect.left) + 'px ' + String((top + bottom) / 2 - rect.top) + 'px';
        glyph.setAttribute('data-svml-text-physical-line', String(line));
      }
    }
  }
  svmlTextReady = true;
  svmlTextTimeline.totalTime(svmlTextAbsoluteTime);
});
window.addEventListener('hf-seek', (event) => {
  if (!event?.detail || typeof event.detail.waitUntil !== 'function') return;
  // HyperFrames requires waitUntil to be registered synchronously while the
  // seek event is dispatched. The Promise itself waits for exact fonts and
  // deterministic static layout validation. Per-frame sampling is synchronous
  // inside the registered timeline and forces layout before it returns. A
  // rejected layout (for example bounded shrink below the authored minimum)
  // therefore rejects the render instead of becoming an unobserved Promise.
  event.detail.waitUntil(svmlTextLayoutReady);
});
`;
