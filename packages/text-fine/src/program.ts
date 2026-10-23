import { assertTimelineIdentity, timelineFrameCount } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import {
  assertSpatialFrame,
  assertSpatialPath,
  assertSpatialPoint,
  resolveContentFit,
} from "@hypit/spatial";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@hypit/spatial";
import { assertTemporalWindowFor } from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import {
  assertVisualTextAppearance,
  assertVisualTrackIdentity,
  sealPresentVisualTrack,
} from "@hypit/composition";
import type {
  VisualElement,
  VisualPathTextElement,
  VisualStyleDeclaration,
  VisualTextElement,
  VisualTextFlowElement,
  PresentVisualTrack,
} from "@hypit/composition";
import { assertCompositableSurfaceRef } from "@hypit/media";
import type { CompositableSurfaceRef } from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import { verifyText } from "@hypit/hypit/text";
import type { Text } from "@hypit/hypit/text";

import type {
  FineTextOccurrence,
  TextItem,
  TextItemSpec,
  PlainTextItemSpec,
  TextMotion,
  TextPathMotion,
  TextMaskSpec,
  TextPlacement,
  TextStyle,
} from "./types.js";

function nonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function assertDocument(document: TextItemSpec["document"], label: string): void {
  if (document.paragraphs.length === 0) throw new Error(`${label} requires a paragraph.`);
  const ids = new Set<string>();
  let visible = false;
  for (const paragraph of document.paragraphs) {
    nonEmpty(paragraph.id, `${label} paragraph id`);
    if (ids.has(paragraph.id) || paragraph.inlines.length === 0) throw new Error(`${label} has an invalid paragraph.`);
    ids.add(paragraph.id);
    for (const inline of paragraph.inlines) {
      nonEmpty(inline.id, `${label} inline id`);
      if (ids.has(inline.id)) throw new Error(`${label} repeats ${inline.id}.`);
      ids.add(inline.id);
      if (inline.kind === "text") {
        if (inline.text.length === 0) throw new Error(`${label} has an empty text run.`);
        visible ||= inline.text.trim().length > 0;
      }
    }
  }
  if (!visible) throw new Error(`${label} contains no visible text.`);
}

export function assertTextStyle(style: TextStyle): void {
  nonEmpty(style.id, "TextStyle id");
  finite(style.typography.sizePx, "TextStyle typography size");
  if (style.typography.sizePx <= 0 || !Number.isSafeInteger(style.typography.weight)) {
    throw new Error("TextStyle typography size or weight is invalid.");
  }
  if (style.typography.fonts === undefined) {
    throw new Error("Official TextStyle requires an exact declared font stack.");
  }
  assertVisualTextAppearance(style, `TextStyle ${style.id}`);
}

export function sealTextStyle(value: TextStyle): TextStyle {
  const result = canonicalize(value) as unknown as TextStyle;
  assertTextStyle(result);
  return result;
}

export function assertTextMotion(motion: TextMotion): void {
  nonEmpty(motion.id, "TextMotion id");
  const ids = new Set<string>();
  for (const sequence of motion.sequences) {
    nonEmpty(sequence.id, "Text sequence id");
    if (ids.has(sequence.id)) throw new Error(`TextMotion repeats sequence ${sequence.id}.`);
    ids.add(sequence.id);
  }
}

export function sealTextMotion(value: TextMotion): TextMotion {
  const result = canonicalize(value) as unknown as TextMotion;
  assertTextMotion(result);
  return result;
}

export const stillTextMotion = (id = "still"): TextMotion => sealTextMotion({

  id,
  sequences: [],
});

export function assertTextPathMotion(motion: TextPathMotion): void {
  nonEmpty(motion.id, "TextPathMotion id");
  if (motion.keyframes.length === 1) throw new Error("TextPathMotion requires zero or at least two keyframes.");
  let previous = -1;
  for (const keyframe of motion.keyframes) {
    finite(keyframe.startMarginPx, "TextPathMotion start margin");
    if (!Number.isSafeInteger(keyframe.atFrame)
      || keyframe.atFrame <= previous
      || keyframe.startMarginPx < 0
      || (keyframe.easing !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(keyframe.easing))) {
      throw new Error("TextPathMotion keyframes are invalid.");
    }
    previous = keyframe.atFrame;
  }
}

export function sealTextPathMotion(value: TextPathMotion): TextPathMotion {
  const result = canonicalize(value) as unknown as TextPathMotion;
  assertTextPathMotion(result);
  return result;
}

export const stillTextPathMotion = (id = "still-path"): TextPathMotion => sealTextPathMotion({ id, keyframes: [] });

export function assertTextItemSpec(value: TextItemSpec): void {
  nonEmpty(value.id, "TextItemSpec id");
  assertDocument(value.document, `${value.id} document`);
}

export function sealTextItemSpec(value: TextItemSpec): TextItemSpec {
  const result = canonicalize(value) as unknown as TextItemSpec;
  assertTextItemSpec(result);
  return result;
}

export function assertPlainTextItemSpec(value: PlainTextItemSpec): void {
  nonEmpty(value.id, "PlainTextItemSpec id");
}

export function sealPlainTextItemSpec(value: PlainTextItemSpec): PlainTextItemSpec {
  const result = canonicalize(value) as unknown as PlainTextItemSpec;
  assertPlainTextItemSpec(result);
  return result;
}

export function materializePlainTextItem(spec: PlainTextItemSpec, content: Text): TextItemSpec {
  assertPlainTextItemSpec(spec);
  verifyText(content);
  if (!content.value.trim()) throw new Error("Typography plain Text content must not be empty.");
  return sealTextItemSpec({

    id: spec.id,
    document: {
      paragraphs: [{
        id: `${spec.id}:paragraph`,
        inlines: [{ kind: "text", id: `${spec.id}:text`, text: content.value }],
      }],
    },
  });
}

export function assertTextPlacement(value: TextPlacement): void {
  if (value.kind === "flow") {
    assertSpatialFrame(value.frame);
    const flow = value.flow;
    if (!["hug", "fixed"].includes(flow.inlineSize) || !["hug", "fixed"].includes(flow.blockSize)
      || !["start", "center", "end", "justify"].includes(flow.inlineAlign)
      || !["start", "center", "end"].includes(flow.blockAlign)
      || !["none", "word", "grapheme"].includes(flow.wrap)
      || !["visible", "clip", "ellipsis", "shrink"].includes(flow.overflow)
      || !["line-box", "cap-height", "ink"].includes(flow.metricEdge)
      || !Number.isSafeInteger(flow.columns) || flow.columns < 1) {
      throw new Error("Flow text placement contains an unsupported layout value.");
    }
    for (const amount of [...Object.values(flow.paddingPx), flow.columnGapPx]) {
      finite(amount, "Flow text placement length");
      if (amount < 0) throw new Error("Flow text placement lengths must not be negative.");
    }
    if (flow.overflow === "shrink") {
      if (flow.minimumScale === undefined || flow.minimumScale <= 0 || flow.minimumScale > 1) {
        throw new Error("Flow shrink overflow requires minimumScale in (0, 1].");
      }
    } else if (flow.minimumScale !== undefined) throw new Error("Flow minimumScale belongs only to shrink overflow.");
    if (flow.maxLines !== undefined && (flow.maxLines < 1 || !Number.isSafeInteger(flow.maxLines)
      || (flow.overflow !== "ellipsis" && flow.overflow !== "shrink"))) {
      throw new Error("Flow maxLines belongs only to ellipsis or shrink overflow.");
    }
    return;
  }
  if (value.kind === "point") {
    assertSpatialPoint(value.point);
    if (!["start", "center", "end"].includes(value.anchorInline)
      || !["start", "center", "end"].includes(value.anchorBlock)) {
      throw new Error("Point text placement contains an unsupported anchor.");
    }
    return;
  }
  if (value.kind === "path") {
    assertSpatialPath(value.path);
    if (!["left", "right"].includes(value.side) || !["follow", "upright"].includes(value.orientation)
      || !["start", "center", "end"].includes(value.align) || !["visible", "clip"].includes(value.overflow)) {
      throw new Error("Path text placement contains an unsupported layout value.");
    }
    for (const amount of [value.startMarginPx, value.endMarginPx]) {
      finite(amount, "Path text placement margin");
      if (amount < 0) throw new Error("Path text placement margins must not be negative.");
    }
    if (value.marginMotion !== undefined) assertTextPathMotion(value.marginMotion);
    return;
  }
  throw new Error("Text placement kind is unsupported.");
}

export function sealTextPlacement(value: TextPlacement): TextPlacement {
  const result = canonicalize(value) as unknown as TextPlacement;
  assertTextPlacement(result);
  return result;
}

export function bindPointTextPlacement(
  point: SpatialPoint,
  policy: Omit<Extract<TextPlacement, { readonly kind: "point" }>, "kind" | "point">,
): TextPlacement {
  return sealTextPlacement({ kind: "point", point, ...policy });
}

export function bindAreaTextPlacement(
  frame: SpatialFrame,
  policy: Omit<Extract<TextPlacement, { readonly kind: "flow" }>, "kind" | "frame">,
): TextPlacement {
  return sealTextPlacement({ kind: "flow", frame, ...policy });
}

export function bindPathTextPlacement(
  path: SpatialPath,
  policy: Omit<Extract<TextPlacement, { readonly kind: "path" }>, "kind" | "path" | "marginMotion">,
  marginMotion: TextPathMotion,
): TextPlacement {
  assertTextPathMotion(marginMotion);
  return sealTextPlacement({ kind: "path", path, ...policy, ...(marginMotion.keyframes.length === 0 ? {} : { marginMotion }) });
}

function projectedItem(
  spec: TextItemSpec,
  style: TextStyle,
  motion: TextMotion,
  placement: TextPlacement,
  window: TemporalWindow,
): TextItem {
  return {
    id: spec.id,
    span: { ...window.span },
    placement: structuredClone(placement),
    document: structuredClone(spec.document),
    style: structuredClone(style),
    motion: structuredClone(motion),
  };
}

function assertTextItemWithinTimeline(item: TextItem, timeline: Timeline): void {
  const total = timelineFrameCount(timeline);
  nonEmpty(item.id, "Text Item id");
  if (item.span.startFrame < 0 || item.span.endFrameExclusive <= item.span.startFrame || item.span.endFrameExclusive > total) {
    throw new Error(`${item.id} is outside Timeline.`);
  }
  assertTextPlacement(item.placement);
  assertDocument(item.document, `${item.id} document`);
  assertTextStyle(item.style);
  assertTextMotion(item.motion);
}

export function createFineTextOccurrence(
  timeline: Timeline,
  placement: TextPlacement,
  spec: TextItemSpec,
  style: TextStyle,
  motion: TextMotion,
  window: TemporalWindow,
): FineTextOccurrence {
  assertTimelineIdentity(timeline);
  assertTextPlacement(placement);
  assertTextItemSpec(spec);
  assertTextStyle(style);
  assertTextMotion(motion);
  assertTemporalWindowFor(window, { timeline });
  const occurrence = canonicalize({
    timelineId: timeline.id,
    ...projectedItem(spec, style, motion, placement, window),
  }) as unknown as FineTextOccurrence;
  assertFineTextOccurrenceIdentity(occurrence, timeline);
  return occurrence;
}

export function assertFineTextOccurrenceIdentity(occurrence: FineTextOccurrence, timeline: Timeline): void {
  assertTimelineIdentity(timeline);
  if (occurrence.timelineId !== timeline.id) {
    throw new Error(`FineTextOccurrence ${occurrence.id} belongs to ${occurrence.timelineId}, not ${timeline.id}.`);
  }
  assertTextItemWithinTimeline(occurrence, timeline);
}

export function assertTextMaskSpec(spec: TextMaskSpec): void {
  nonEmpty(spec.id, "TextMaskSpec id");
  if (!["alpha", "luminance"].includes(spec.mode)) throw new Error("TextMaskSpec mode is invalid.");
  if (!["contain", "cover", "fill"].includes(spec.materialFit)) throw new Error("TextMaskSpec materialFit is invalid.");
}

export function sealTextMaskSpec(value: TextMaskSpec): TextMaskSpec {
  const result = canonicalize(value) as unknown as TextMaskSpec;
  assertTextMaskSpec(result);
  return result;
}

function baseBoxStyle(placement: TextPlacement): VisualStyleDeclaration[] {
  if (placement.kind === "flow") return [
    { name: "position", value: "absolute" },
    { name: "left", value: `${placement.frame.xPx}px` },
    { name: "top", value: `${placement.frame.yPx}px` },
    { name: "width", value: `${placement.frame.widthPx}px` },
    { name: "height", value: `${placement.frame.heightPx}px` },
  ];
  if (placement.kind === "point") return [
    { name: "position", value: "absolute" },
    { name: "left", value: `${placement.point.xPx}px` },
    { name: "top", value: `${placement.point.yPx}px` },
    { name: "width", value: "max-content" },
    { name: "height", value: "max-content" },
  ];
  return [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }];
}

function pointAnchorTransform(item: TextItem): string | undefined {
  if (item.placement.kind !== "point") return undefined;
  const inline = item.placement.anchorInline === "start" ? 0 : item.placement.anchorInline === "center" ? -50 : -100;
  const block = item.placement.anchorBlock === "start" ? 0 : item.placement.anchorBlock === "center" ? -50 : -100;
  return `translate(${inline}%,${block}%)`;
}

function pathCommands(path: SpatialPath): VisualPathTextElement["path"] {
  return path.commands.map((command) => {
    if (command.kind === "move" || command.kind === "line") return { kind: command.kind, x: command.xPx, y: command.yPx };
    if (command.kind === "quadratic") return { kind: command.kind, controlX: command.controlX, controlY: command.controlY, x: command.xPx, y: command.yPx };
    if (command.kind === "cubic") return { kind: command.kind, control1X: command.control1X, control1Y: command.control1Y, control2X: command.control2X, control2Y: command.control2Y, x: command.xPx, y: command.yPx };
    return { kind: "close" };
  });
}

function pointFlow(item: TextItem): VisualTextFlowElement["flow"] {
  return {
    paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
    inlineAlign: "start",
    blockAlign: "start",
    columnGapPx: 0,
    metricEdge: "line-box",
    form: { kind: "point", anchorInline: item.placement.kind === "point" ? item.placement.anchorInline : "start", anchorBlock: item.placement.kind === "point" ? item.placement.anchorBlock : "start" },
    inlineSize: "hug",
    blockSize: "hug",
    wrap: "none",
    overflow: "visible",
    clipToFrame: false,
    columns: 1,
  };
}

function terminalTextElement(item: TextItem): VisualTextFlowElement | VisualPathTextElement {
  if (item.placement.kind === "path") return {
    id: "text",
    kind: "path-text",
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    document: item.document,
    typography: item.style.typography,
    paints: item.style.paints,
    path: pathCommands(item.placement.path),
    side: item.placement.side,
    orientation: item.placement.orientation,
    startMarginPx: item.placement.startMarginPx,
    endMarginPx: item.placement.endMarginPx,
    align: item.placement.align,
    reverse: item.placement.reverse,
    overflow: item.placement.overflow,
    sequences: item.motion.sequences,
    ...(item.placement.marginMotion === undefined ? {} : { marginAnimation: { keyframes: item.placement.marginMotion.keyframes } }),
  };
  return {
    id: "text",
    kind: "text-flow",
    style: item.placement.kind === "point"
      ? [{ name: "position", value: "relative" }]
      : [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    document: item.document,
    typography: item.style.typography,
    paints: item.style.paints,
    flow: item.placement.kind === "point"
      ? pointFlow(item)
      : { ...(item.placement.kind === "flow" ? item.placement.flow : {}), form: { kind: "area" } } as VisualTextFlowElement["flow"],
    sequences: item.motion.sequences,
  };
}

function maskText(item: TextItem): string {
  if (item.placement.kind !== "flow") throw new Error(`${item.id} non-Flow Text Mask must be materialized by an independent package.`);
  if (item.motion.sequences.length !== 0) {
    throw new Error(`${item.id} sequenced Text Mask must be materialized by an independent package.`);
  }
  if (item.document.paragraphs.length !== 1) {
    throw new Error(`${item.id} multiline Text Mask must be materialized by an independent package.`);
  }
  return item.document.paragraphs.map((paragraph) => {
    if (paragraph.style !== undefined) {
      throw new Error(`${item.id} styled Text Mask paragraph must be materialized by an independent package.`);
    }
    return paragraph.inlines.map((inline) => {
      if (inline.kind === "break") throw new Error(`${item.id} multiline Text Mask must be materialized by an independent package.`);
      if (inline.style !== undefined || inline.language !== undefined || inline.direction !== undefined) {
        throw new Error(`${item.id} rich Text Mask run must be materialized by an independent package.`);
      }
      return inline.text;
    }).join("");
  }).join("\n");
}

function maskTextElement(item: TextItem): VisualTextElement {
  const typography = item.style.typography;
  if (item.placement.kind !== "flow") throw new Error(`${item.id} non-Flow Text Mask must be materialized by an independent package.`);
  const area = item.placement.flow;
  if (area.inlineSize !== "fixed" || area.blockSize !== "fixed" || area.wrap !== "none"
    || area.columns !== 1 || area.overflow === "ellipsis" || area.overflow === "shrink"
    || typography.writingMode !== "horizontal-tb" || typography.decorations.length !== 0) {
    throw new Error(`${item.id} advanced Text Mask flow must be materialized by an independent package.`);
  }
  const fonts = typography.fonts;
  if (fonts.length === 0) throw new Error("Text Mask requires an exact declared font stack.");
  if (fonts !== undefined) {
    const primary = fonts[0];
    if (primary === undefined || primary.weight !== typography.weight || primary.style !== typography.style || typography.synthesis !== "none") {
      throw new Error(`${item.id} Text Mask typography must match its primary exact font without synthesis.`);
    }
  }
  const style: VisualStyleDeclaration[] = [
    { name: "position", value: "absolute" },
    { name: "inset", value: 0 },
    { name: "box-sizing", value: "border-box" },
    { name: "align-items", value: area.blockAlign === "start" ? "flex-start" : area.blockAlign === "end" ? "flex-end" : "center" },
    { name: "padding-top", value: `${area.paddingPx.blockStart}px` },
    { name: "padding-right", value: `${area.paddingPx.inlineEnd}px` },
    { name: "padding-bottom", value: `${area.paddingPx.blockEnd}px` },
    { name: "padding-left", value: `${area.paddingPx.inlineStart}px` },
    { name: "overflow", value: area.overflow === "clip" || area.clipToFrame ? "hidden" : "visible" },
    { name: "text-align", value: area.inlineAlign },
    { name: "font-size", value: `${typography.sizePx}px` },
    { name: "font-kerning", value: typography.kerning },
    { name: "letter-spacing", value: `${typography.trackingPx}px` },
    { name: "word-spacing", value: `${typography.wordSpacingPx}px` },
    { name: "line-height", value: typography.lineHeight },
    { name: "writing-mode", value: typography.writingMode },
    { name: "text-transform", value: typography.transform },
    { name: "font-variant-caps", value: typography.variantCaps },
    { name: "tab-size", value: typography.tabSize },
    { name: "text-indent", value: `${typography.indentationPx}px` },
    { name: "vertical-align", value: typography.verticalAlign },
    { name: "color", value: "#ffffff" },
  ];
  if (typography.direction !== "auto") style.push({ name: "direction", value: typography.direction });
  if (typography.axes.length !== 0) {
    style.push({ name: "font-variation-settings", value: typography.axes.map(({ tag, value }) => `"${tag}" ${value}`).join(",") });
  }
  if (typography.features.length !== 0) {
    style.push({ name: "font-feature-settings", value: typography.features.map(({ tag, enabled }) => `"${tag}" ${enabled ? 1 : 0}`).join(",") });
  }
  return {
    id: "text", kind: "text",
    text: maskText(item), fonts, style,
    attributes: [
      ...(typography.language === undefined ? [] : [{ name: "lang", value: typography.language }]),
      ...(typography.direction === "auto" ? [] : [{ name: "dir", value: typography.direction }]),
    ],
  };
}

function elementRoot(item: TextItem): VisualElement {
  const rootStyle = baseBoxStyle(item.placement);
  const anchor = pointAnchorTransform(item);
  if (anchor !== undefined) rootStyle.push({ name: "transform", value: anchor });
  const text = terminalTextElement(item);
  const motion: VisualElement = {
    id: "motion",
    kind: "box",
    children: [text],
    style: item.placement.kind === "point"
      ? [{ name: "position", value: "relative" }]
      : [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    ...(item.motion.item === undefined ? {} : { animation: item.motion.item }),
  };
  return { id: "placement", kind: "box", children: [motion], style: rootStyle };
}

export function renderFineTextOccurrence(timeline: Timeline, occurrence: FineTextOccurrence): PresentVisualTrack {
  assertFineTextOccurrenceIdentity(occurrence, timeline);
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    id: occurrence.id,
    presents: [{
      id: occurrence.id,
      span: { ...occurrence.span },
      root: elementRoot(occurrence),
    }],
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}

function renderTextMaskItems(
  timeline: Timeline,
  items: readonly TextItem[],
  material: CompositableSurfaceRef,
  spec: TextMaskSpec,
): PresentVisualTrack {
  assertCompositableSurfaceRef(material);
  assertTextMaskSpec(spec);
  if (material.timing.kind !== "still") {
    throw new Error("Official Text Mask requires one explicit still material Surface; timed materials use an independent package.");
  }
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    id: spec.id,
    presents: items.map((item) => {
      if (item.placement.kind !== "flow") {
        throw new Error(`${item.id} non-Flow Text Mask must be materialized by an independent package.`);
      }
      const style = baseBoxStyle(item.placement);
      const anchor = pointAnchorTransform(item);
      if (anchor !== undefined) style.push({ name: "transform", value: anchor });
      const mapping = resolveContentFit(
        item.placement.frame,
        { widthPx: material.width, heightPx: material.height },
        {
          sizing: spec.materialFit === "fill" ? "stretch" : spec.materialFit,
          framePoint: { x: 0.5, y: 0.5 },
          contentPoint: { x: 0.5, y: 0.5 },
          offsetPx: { x: 0, y: 0 },
          constraint: "bounded",
        },
      );
      return {
        id: item.id,
        span: { ...item.span },
        root: {
            id: "mask", kind: "mask", mode: spec.mode,
            mask: maskTextElement(item),
            content: {
              id: "material", kind: "surface", surface: material,
              style: [
                { name: "position", value: "absolute" }, { name: "left", value: 0 }, { name: "top", value: 0 },
                { name: "width", value: `${material.width}px` }, { name: "height", value: `${material.height}px` },
                { name: "transform-origin", value: "0 0" },
                { name: "transform", value: `matrix(${mapping.xx},${mapping.yx},${mapping.xy},${mapping.yy},${mapping.tx - item.placement.frame.xPx},${mapping.ty - item.placement.frame.yPx})` },
              ],
            },
            style,
            ...(item.motion.item === undefined ? {} : { animation: item.motion.item }),
          },
      };
    }),
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}

export function renderFineTextMask(
  timeline: Timeline,
  occurrence: FineTextOccurrence,
  material: CompositableSurfaceRef,
  spec: TextMaskSpec,
): PresentVisualTrack {
  assertFineTextOccurrenceIdentity(occurrence, timeline);
  return renderTextMaskItems(timeline, [occurrence], material, spec);
}
