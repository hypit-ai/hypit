import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import {
  assertSemanticTrackIdentity,
  assertNarrativeMomentIdentity,
  assertNarrativeSelectionIdentity,
} from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";
import {
  assertSpatialFrame,
  assertSpatialPath,
  assertSpatialPoint,
} from "@hypit/spatial";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@hypit/spatial";
import {
  assertWindowRelation,
  projectMomentWindows,
  projectProgramWindow,
  projectSelectionWindows,
} from "@hypit/temporal";
import type { ProjectedOccurrence } from "@hypit/temporal";
import {
  assertVisualTrackIdentity,
  sealVisualTrack,
} from "@hypit/composition";
import type {
  VisualElement,
  VisualPathTextElement,
  VisualStyleDeclaration,
  VisualTextElement,
  VisualTextFlowElement,
  VisualTrack,
} from "@hypit/composition";
import { assertCompositableSurfaceRef } from "@hypit/media";
import type { CompositableSurfaceRef } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import { verifyText } from "@hypit/text";
import type { Text } from "@hypit/text";

import type {
  TextGeometry,
  TextItem,
  TextItemSpec,
  PlainTextItemSpec,
  TextMotion,
  TextMaskSpec,
  TextPlacement,
  TextStyle,
  TypographyTrackHeader,
  TypographyTrackProgram,
  TypographyTrackSet,
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
  if (!Number.isSafeInteger(style.stackingOrder)) throw new Error("TextStyle stackingOrder must be a safe integer.");
  finite(style.typography.sizePx, "TextStyle typography size");
  if (style.typography.sizePx <= 0 || !Number.isSafeInteger(style.typography.weight)) {
    throw new Error("TextStyle typography size or weight is invalid.");
  }
  if (style.typography.fonts === undefined) {
    throw new Error("Official TextStyle requires an exact content-addressed font stack.");
  }
  if (!["start", "center", "end"].includes(style.point.anchorInline)
    || !["start", "center", "end"].includes(style.point.anchorBlock)
    || !["left", "right"].includes(style.path.side)
    || !["follow", "upright"].includes(style.path.orientation)
    || !["start", "center", "end"].includes(style.path.align)
    || !["visible", "clip"].includes(style.path.overflow)) {
    throw new Error("TextStyle contains an unsupported Point or Path enum.");
  }
  if (style.area.overflow === "shrink") {
    if (style.area.minimumScale === undefined || style.area.minimumScale <= 0 || style.area.minimumScale > 1) {
      throw new Error("TextStyle shrink overflow requires minimumScale in (0, 1].");
    }
  } else if (style.area.minimumScale !== undefined) throw new Error("TextStyle minimumScale belongs only to shrink overflow.");
  if (style.area.maxLines !== undefined && style.area.overflow !== "ellipsis" && style.area.overflow !== "shrink") {
    throw new Error("TextStyle maxLines belongs only to ellipsis or shrink overflow.");
  }
  for (const value of [style.path.startMarginPx, style.path.endMarginPx]) {
    finite(value, "TextStyle path margin");
    if (value < 0) throw new Error("TextStyle path margins must not be negative.");
  }
  assertVisualTrackIdentity({
    kind: "visual",
    visualIr: "hypit.visual-ir@1",
    id: "text-style-validation",
    presents: [{
      id: "style",
      span: { startFrame: 0, endFrameExclusive: 1 },
      stacking: { order: style.stackingOrder, tieBreak: style.id },
      elements: [
        { id: "root", kind: "box", order: 0, style: [] },
        {
          id: "text", parent: "root", kind: "text-flow", order: 1, style: [],
          document: { paragraphs: [{ id: "paragraph", inlines: [{ kind: "text", id: "run", text: "M" }] }] },
          typography: style.typography,
          paints: style.paints,
          flow: { ...style.area, form: { kind: "area" } },
          sequences: [],
        },
      ],
    }],
  });
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
  if (motion.pathMargin !== undefined) {
    if (motion.pathMargin.keyframes.length < 2) throw new Error("Path-margin motion requires two keyframes.");
    let previous = -1;
    for (const keyframe of motion.pathMargin.keyframes) {
      finite(keyframe.startMarginPx, "Path-margin start margin");
      if (!Number.isSafeInteger(keyframe.atFrame)
        || keyframe.atFrame <= previous
        || keyframe.startMarginPx < 0
        || (keyframe.easing !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(keyframe.easing))) {
        throw new Error("Path-margin motion keyframes are invalid.");
      }
      previous = keyframe.atFrame;
    }
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
    projection: spec.projection,
    expansion: spec.expansion,
  });
}

export function assertTypographyTrackHeader(value: TypographyTrackHeader): void {
  nonEmpty(value.id, "TypographyTrackHeader id");
}

export function sealTypographyTrackHeader(value: TypographyTrackHeader): TypographyTrackHeader {
  const result = canonicalize(value) as unknown as TypographyTrackHeader;
  assertTypographyTrackHeader(result);
  return result;
}

function assertGeometry(geometry: TextGeometry): void {
  if (geometry.kind === "point") assertSpatialPoint(geometry.point);
  else if (geometry.kind === "area") assertSpatialFrame(geometry.frame);
  else if (geometry.kind === "path") assertSpatialPath(geometry.path);
  else throw new Error("Text geometry is unsupported.");
}

export function assertTextPlacement(value: TextPlacement): void {
  assertGeometry(value.geometry);
}

export function sealTextPlacement(value: TextPlacement): TextPlacement {
  const result = canonicalize(value) as unknown as TextPlacement;
  assertTextPlacement(result);
  return result;
}

export function bindPointTextPlacement(point: SpatialPoint): TextPlacement {
  assertSpatialPoint(point);
  return sealTextPlacement({ geometry: { kind: "point", point } });
}

export function bindAreaTextPlacement(frame: SpatialFrame): TextPlacement {
  assertSpatialFrame(frame);
  return sealTextPlacement({ geometry: { kind: "area", frame } });
}

export function bindPathTextPlacement(path: SpatialPath): TextPlacement {
  assertSpatialPath(path);
  return sealTextPlacement({ geometry: { kind: "path", path } });
}

export function assertTypographyTrackSet(value: TypographyTrackSet): void {
  const ids = new Set<string>();
  for (const item of value.items) {
    if (ids.has(item.id)) throw new Error(`TypographyTrackSet repeats ${item.id}.`);
    ids.add(item.id);
    assertGeometry(item.geometry);
    assertDocument(item.document, `${item.id} document`);
    assertTextStyle(item.style);
    assertTextMotion(item.motion);
  }
}

export function createTypographyTrackSet(): TypographyTrackSet {
  return { items: [] };
}

function occurrenceItem(
  header: TypographyTrackHeader,
  spec: TextItemSpec,
  style: TextStyle,
  motion: TextMotion,
  geometry: TextGeometry,
  occurrence: ProjectedOccurrence,
  index: number,
  count: number,
): TextItem {
  return {
    id: count === 1 ? spec.id : occurrence.id,
    span: { ...occurrence.span },
    geometry: structuredClone(geometry),
    document: structuredClone(spec.document),
    style: structuredClone(style),
    motion: structuredClone(motion),
    tieBreak: `${header.id}:${spec.id}:${index + 1}`,
  };
}

function append(
  set: TypographyTrackSet,
  header: TypographyTrackHeader,
  spec: TextItemSpec,
  style: TextStyle,
  motion: TextMotion,
  geometry: TextGeometry,
  occurrences: readonly ProjectedOccurrence[],
): TypographyTrackSet {
  assertTypographyTrackSet(set);
  assertTypographyTrackHeader(header);
  assertTextItemSpec(spec);
  assertTextStyle(style);
  assertTextMotion(motion);
  assertGeometry(geometry);
  const existing = new Set(set.items.map((item) => item.id));
  const additions = occurrences.map((occurrence, index) => occurrenceItem(header, spec, style, motion, geometry, occurrence, index, occurrences.length));
  if (additions.some((item) => existing.has(item.id))) throw new Error(`TypographyTrackSet already contains ${spec.id}.`);
  return { items: [...set.items, ...additions] };
}

export function appendProgramTextItem(
  set: TypographyTrackSet,
  header: TypographyTrackHeader,
  semantic: SemanticTrack,
  placement: TextPlacement,
  spec: TextItemSpec,
  style: TextStyle,
  motion: TextMotion,
): TypographyTrackSet {
  assertSemanticTrackIdentity(semantic);
  assertTextPlacement(placement);
  if (spec.expansion.kind !== "one") throw new Error("Program Text uses one occurrence.");
  return append(set, header, spec, style, motion, placement.geometry, [projectProgramWindow({ itemId: spec.id, semantic, projection: spec.projection })]);
}

export function appendSelectionTextItem(
  set: TypographyTrackSet,
  header: TypographyTrackHeader,
  semantic: SemanticTrack,
  selection: NarrativeSelectionRef,
  placement: TextPlacement,
  spec: TextItemSpec,
  style: TextStyle,
  motion: TextMotion,
): TypographyTrackSet {
  assertSemanticTrackIdentity(semantic);
  assertNarrativeSelectionIdentity(selection);
  assertTextPlacement(placement);
  return append(set, header, spec, style, motion, placement.geometry, assertWindowRelation(projectSelectionWindows({
    itemId: spec.id, semantic, selection, projection: spec.projection, expansion: spec.expansion,
  }), "disjoint"));
}

export function appendMomentTextItem(
  set: TypographyTrackSet,
  header: TypographyTrackHeader,
  semantic: SemanticTrack,
  moment: NarrativeMomentRef,
  placement: TextPlacement,
  spec: TextItemSpec,
  style: TextStyle,
  motion: TextMotion,
): TypographyTrackSet {
  assertSemanticTrackIdentity(semantic);
  assertNarrativeMomentIdentity(moment);
  assertTextPlacement(placement);
  return append(set, header, spec, style, motion, placement.geometry, assertWindowRelation(projectMomentWindows({
    itemId: spec.id, semantic, moment, projection: spec.projection, expansion: spec.expansion,
  }), "disjoint"));
}

function programContent(value: TypographyTrackProgram): TypographyTrackProgram {
  return {

    id: value.id,
    items: [...value.items].map((item) => structuredClone(item)).sort((left, right) =>
      left.span.startFrame - right.span.startFrame
      || left.style.stackingOrder - right.style.stackingOrder
      || left.tieBreak.localeCompare(right.tieBreak)
      || left.id.localeCompare(right.id)),
  };
}

export function sealTypographyTrackProgram(value: TypographyTrackProgram): TypographyTrackProgram {
  return programContent(value);
}

export function assertTypographyTrackProgramIdentity(program: TypographyTrackProgram, space: ProgramSpace): void {
  assertProgramSpaceIdentity(space);
  nonEmpty(program.id, "TypographyTrackProgram id");
  if (program.items.length === 0) throw new Error("TypographyTrackProgram has no Items.");
  const total = programSpaceFrameCount(space);
  const ids = new Set<string>();
  for (const item of program.items) {
    nonEmpty(item.id, "Text Item id");
    if (ids.has(item.id)) throw new Error(`TypographyTrackProgram repeats ${item.id}.`);
    ids.add(item.id);
    if (item.span.startFrame < 0 || item.span.endFrameExclusive <= item.span.startFrame || item.span.endFrameExclusive > total) {
      throw new Error(`${item.id} is outside ProgramSpace.`);
    }
    assertGeometry(item.geometry);
    assertDocument(item.document, `${item.id} document`);
    assertTextStyle(item.style);
    assertTextMotion(item.motion);
  }
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

export function finalizeTypographyTrack(header: TypographyTrackHeader, set: TypographyTrackSet): TypographyTrackProgram {
  assertTypographyTrackHeader(header);
  assertTypographyTrackSet(set);
  if (set.items.length === 0) throw new Error("TypographyTrack requires at least one Item.");
  return sealTypographyTrackProgram({ id: header.id, items: set.items });
}

function baseBoxStyle(geometry: TextGeometry): VisualStyleDeclaration[] {
  if (geometry.kind === "area") return [
    { name: "position", value: "absolute" },
    { name: "left", value: `${geometry.frame.xPx}px` },
    { name: "top", value: `${geometry.frame.yPx}px` },
    { name: "width", value: `${geometry.frame.widthPx}px` },
    { name: "height", value: `${geometry.frame.heightPx}px` },
  ];
  if (geometry.kind === "point") return [
    { name: "position", value: "absolute" },
    { name: "left", value: `${geometry.point.xPx}px` },
    { name: "top", value: `${geometry.point.yPx}px` },
    { name: "width", value: "max-content" },
    { name: "height", value: "max-content" },
  ];
  return [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }];
}

function pointAnchorTransform(item: TextItem): string | undefined {
  if (item.geometry.kind !== "point") return undefined;
  const inline = item.style.point.anchorInline === "start" ? 0 : item.style.point.anchorInline === "center" ? -50 : -100;
  const block = item.style.point.anchorBlock === "start" ? 0 : item.style.point.anchorBlock === "center" ? -50 : -100;
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
  const { maxLines: _maxLines, minimumScale: _minimumScale, ...area } = item.style.area;
  return {
    ...area,
    form: { kind: "point", ...item.style.point },
    inlineSize: "hug",
    blockSize: "hug",
    wrap: "none",
    overflow: "visible",
    clipToFrame: false,
    columns: 1,
  };
}

function terminalTextElement(item: TextItem, parent: string, order: number): VisualTextFlowElement | VisualPathTextElement {
  if (item.geometry.kind === "path") return {
    id: "text",
    parent,
    kind: "path-text",
    order,
    style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    document: item.document,
    typography: item.style.typography,
    paints: item.style.paints,
    path: pathCommands(item.geometry.path),
    ...item.style.path,
    sequences: item.motion.sequences,
    ...(item.motion.pathMargin === undefined ? {} : { marginAnimation: item.motion.pathMargin }),
  };
  return {
    id: "text",
    parent,
    kind: "text-flow",
    order,
    style: item.geometry.kind === "point"
      ? [{ name: "position", value: "relative" }]
      : [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    document: item.document,
    typography: item.style.typography,
    paints: item.style.paints,
    flow: item.geometry.kind === "point"
      ? pointFlow(item)
      : { ...item.style.area, form: { kind: "area" } },
    sequences: item.motion.sequences,
  };
}

function maskText(item: TextItem): string {
  if (item.geometry.kind !== "area") throw new Error(`${item.id} non-Area Text Mask must be materialized by an independent package.`);
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
  const area = item.style.area;
  if (area.inlineSize !== "fixed" || area.blockSize !== "fixed" || area.wrap !== "none"
    || area.columns !== 1 || area.overflow === "ellipsis" || area.overflow === "shrink"
    || typography.writingMode !== "horizontal-tb" || typography.decorations.length !== 0) {
    throw new Error(`${item.id} advanced Text Mask flow must be materialized by an independent package.`);
  }
  const fonts = typography.fonts;
  if (fonts.length === 0) throw new Error("Text Mask requires an exact content-addressed font stack.");
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
    id: "text", parent: "mask", kind: "text", order: 1,
    text: maskText(item), fonts, style,
    attributes: [
      ...(typography.language === undefined ? [] : [{ name: "lang", value: typography.language }]),
      ...(typography.direction === "auto" ? [] : [{ name: "dir", value: typography.direction }]),
    ],
  };
}

function assertMotionDomain(item: TextItem): void {
  if (item.motion.pathMargin !== undefined) {
    if (item.geometry.kind !== "path") throw new Error(`${item.id} path-margin motion requires Path Text.`);
  }
}

function elements(item: TextItem): VisualElement[] {
  const rootStyle = baseBoxStyle(item.geometry);
  const anchor = pointAnchorTransform(item);
  if (anchor !== undefined) rootStyle.push({ name: "transform", value: anchor });
  const root: VisualElement = { id: "placement", kind: "box", order: 0, style: rootStyle };
  const motion: VisualElement = {
    id: "motion",
    parent: "placement",
    kind: "box",
    order: 1,
    style: item.geometry.kind === "point"
      ? [{ name: "position", value: "relative" }]
      : [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
    ...(item.motion.item === undefined ? {} : { animation: item.motion.item }),
  };
  assertMotionDomain(item);
  return [root, motion, terminalTextElement(item, "motion", 2)];
}

export function renderTypographyTrack(space: ProgramSpace, program: TypographyTrackProgram): VisualTrack {
  assertTypographyTrackProgramIdentity(program, space);
  const track = sealVisualTrack({
    visualIr: "hypit.visual-ir@1",
    id: program.id,
    presents: program.items.map((item) => ({
      id: item.id,
      span: { ...item.span },
      stacking: { order: item.style.stackingOrder, tieBreak: item.tieBreak },
      elements: elements(item),
    })),
  });
  assertVisualTrackIdentity(track, space);
  return track;
}

export function renderTextMaskTrack(
  space: ProgramSpace,
  program: TypographyTrackProgram,
  material: CompositableSurfaceRef,
  spec: TextMaskSpec,
): VisualTrack {
  assertTypographyTrackProgramIdentity(program, space);
  assertCompositableSurfaceRef(material);
  assertTextMaskSpec(spec);
  if (material.timing.kind !== "still") {
    throw new Error("Official Text Mask requires one explicit still material Surface; timed materials use an independent package.");
  }
  const track = sealVisualTrack({
    visualIr: "hypit.visual-ir@1",
    id: spec.id,
    presents: program.items.map((item) => {
      assertMotionDomain(item);
      const style = baseBoxStyle(item.geometry);
      const anchor = pointAnchorTransform(item);
      if (anchor !== undefined) style.push({ name: "transform", value: anchor });
      return {
        id: item.id,
        span: { ...item.span },
        stacking: { order: item.style.stackingOrder, tieBreak: `${item.tieBreak}:mask` },
        elements: [
          {
            id: "mask", kind: "mask", order: 0, mode: spec.mode,
            maskElement: "text", contentElement: "material", style,
            ...(item.motion.item === undefined ? {} : { animation: item.motion.item }),
          },
          maskTextElement(item),
          {
            id: "material", parent: "mask", kind: "surface", order: 2, surface: material,
            style: [
              { name: "position", value: "absolute" }, { name: "inset", value: 0 },
              { name: "width", value: "100%" }, { name: "height", value: "100%" },
              { name: "object-fit", value: spec.materialFit },
            ],
          },
        ],
      };
    }),
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
