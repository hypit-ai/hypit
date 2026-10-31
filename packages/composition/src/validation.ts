import { assertAudioLevelAutomation } from "./audio-level-automation.js";
import { assertBlobRef, canonicalStringify } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";
import {
  assertFrameSpan as assertTimelineFrameSpan,
  assertTimelineIdentity,
  timelineFrameCount,
  timelineSampleFrames,
} from "@hypit/timeline";
import type { FrameSpan, Timeline } from "@hypit/timeline";
import {
  assertCompositableSurfaceRef,
  assertFontArtifactRef,
  verifyPreparedAudioSource,
  verifyPreparedVisualSource,
  verifyPictureInterpretation,
} from "@hypit/media";
import type { FontArtifactRef, PreparedVisualSource } from "@hypit/media";
import {
  assertTemporalMap,
  compareExactTemporalValues,
  exactTemporalValueFromFrames,
  exactTemporalZero,
  resolveTemporalBoundary,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { ExactTemporalValue, TemporalMap } from "@hypit/temporal";
import type {
  VisualProgram,
  VisualTextTypography,
  VisualTextRunStyle,
  VisualTextDocument,
  VisualColorPaint,
  VisualTextBoxDecoration,
  VisualTextPaintLayer,
  VisualTextFlow,
  VisualTextSequenceAnimation,
  VisualVectorPathCommand,
  VisualElement,
  VisualItemBase,
  VisualPresent,
  VisualContribution,
  VisualAdjustment,
  VisualItem,
  VisualTrack,
  AudioSignalRef,
  AudioProcessProgram,
  AudioReconstructionProgram,
  AudioGraphNode,
  AudioTrack,
  Track,
  VisualProcessEffect,
  VisualScope,
  VisualComposition,
  AudioComposition,
  Composition
} from "./types.js";

function assertNonEmpty(value: string, label: string): void {
  if (!value) throw new Error(`${label} must not be empty.`);
}

function assertFrameSpan(span: FrameSpan, totalFrames: number, label: string): void {
  try {
    assertTimelineFrameSpan(span, totalFrames);
  } catch {
    throw new Error(`${label} is outside Timeline.`);
  }
}

function assertMediaArtifact(artifact: BlobRef, label: string): void {
  assertBlobRef(artifact, label);
}

function assertSampling(
  value: TemporalMap,
  label: string,
  expectedTargetDuration?: ExactTemporalValue,
  expectedSourceDuration?: ExactTemporalValue,
): void {
  assertTemporalMap(value);
  if (expectedTargetDuration !== undefined
    && compareExactTemporalValues(value.stages[0]!.target.duration, expectedTargetDuration) !== 0) {
    throw new Error(`${label} target domain differs from its occurrence.`);
  }
  if (expectedSourceDuration !== undefined
    && compareExactTemporalValues(value.stages.at(-1)!.source.duration, expectedSourceDuration) !== 0) {
    throw new Error(`${label} source domain differs from its prepared signal source.`);
  }
}

function assertVisualSampling(
  value: TemporalMap,
  label: string,
  expectedTargetDuration: ExactTemporalValue | undefined,
  source: PreparedVisualSource,
): void {
  assertSampling(value, label, expectedTargetDuration, source.sourceDomain.duration);
}


function assertExactFonts(fonts: readonly FontArtifactRef[], label: string): void {
  if (fonts.length === 0) throw new Error(`${label} has an empty font stack.`);
  const faces = new Set<string>();
  for (const [index, font] of fonts.entries()) {
    assertFontArtifactRef(font, `${label}.${index}`);
    const face = canonicalStringify(font);
    if (faces.has(face)) throw new Error(`${label} has a duplicate font face.`);
    faces.add(face);
  }
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function nonNegative(value: number, label: string): void {
  finite(value, label);
  if (value < 0) throw new Error(`${label} must not be negative.`);
}

function assertColor(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (value.length > 256
    || /[;{}<>"'\\]|!important|[\u0000-\u001f\u007f]/iu.test(value)
    || /(?:url|var|env|attr|image-set)\s*\(/iu.test(value)) {
    throw new Error(`${label} contains an unsafe or environment-dependent color.`);
  }
}

function assertColorPaint(paint: VisualColorPaint, label: string): void {
  if (paint.kind === "solid") {
    assertColor(paint.color, `${label}.color`);
    return;
  }
  if (paint.kind !== "linear-gradient" && paint.kind !== "radial-gradient") {
    throw new Error(`${label} has an unsupported Paint kind.`);
  }
  if (paint.kind === "linear-gradient") finite(paint.angleDeg, `${label}.angleDeg`);
  else {
    finite(paint.center.x, `${label}.center.x`);
    finite(paint.center.y, `${label}.center.y`);
    if (paint.center.x < 0 || paint.center.x > 1 || paint.center.y < 0 || paint.center.y > 1) {
      throw new Error(`${label}.center must be normalized.`);
    }
  }
  if (paint.stops.length < 2) throw new Error(`${label} requires at least two gradient stops.`);
  let previous = -1;
  for (const [index, stop] of paint.stops.entries()) {
    finite(stop.offset, `${label}.stops.${index}.offset`);
    finite(stop.opacity, `${label}.stops.${index}.opacity`);
    assertColor(stop.color, `${label}.stops.${index}.color`);
    if (stop.offset < 0 || stop.offset > 1 || stop.offset < previous || stop.opacity < 0 || stop.opacity > 1) {
      throw new Error(`${label} has invalid gradient stops.`);
    }
    previous = stop.offset;
  }
}

function assertTypography(typography: VisualTextTypography, label: string): void {
  assertExactFonts(typography.fonts, `${label}.fonts`);
  finite(typography.sizePx, `${label}.sizePx`);
  if (typography.sizePx <= 0 || !Number.isSafeInteger(typography.weight) || typography.weight < 1 || typography.weight > 1_000) {
    throw new Error(`${label} size or weight is invalid.`);
  }
  if (!["normal", "italic", "oblique"].includes(typography.style)
    || !["none", "weight", "style", "weight-style"].includes(typography.synthesis)
    || !["auto", "normal", "none"].includes(typography.kerning)
    || !["auto", "ltr", "rtl"].includes(typography.direction)
    || !["horizontal-tb", "vertical-rl", "vertical-lr"].includes(typography.writingMode)
    || !["none", "uppercase", "lowercase", "capitalize"].includes(typography.transform)
    || !["normal", "small-caps", "all-small-caps"].includes(typography.variantCaps)
    || !["baseline", "super", "sub"].includes(typography.verticalAlign)) {
    throw new Error(`${label} contains an unsupported typography enum.`);
  }
  for (const [name, value] of Object.entries({
    trackingPx: typography.trackingPx,
    wordSpacingPx: typography.wordSpacingPx,
    lineHeight: typography.lineHeight,
    baselineShiftPx: typography.baselineShiftPx,
    indentationPx: typography.indentationPx,
    paragraphBeforePx: typography.paragraphBeforePx,
    paragraphAfterPx: typography.paragraphAfterPx,
  })) finite(value, `${label}.${name}`);
  if (typography.lineHeight <= 0 || !Number.isSafeInteger(typography.tabSize) || typography.tabSize <= 0) {
    throw new Error(`${label} lineHeight or tabSize is invalid.`);
  }
  const axes = new Set<string>();
  for (const [index, axis] of typography.axes.entries()) {
    if (!/^[\x20-\x7e]{4}$/u.test(axis.tag) || axes.has(axis.tag)) throw new Error(`${label}.axes.${index} is invalid.`);
    finite(axis.value, `${label}.axes.${index}.value`);
    axes.add(axis.tag);
  }
  const features = new Set<string>();
  for (const [index, feature] of typography.features.entries()) {
    if (!/^[\x20-\x7e]{4}$/u.test(feature.tag) || features.has(feature.tag)) throw new Error(`${label}.features.${index} is invalid.`);
    features.add(feature.tag);
  }
  const decorations = new Set<string>();
  for (const [index, decoration] of typography.decorations.entries()) {
    const item = `${label}.decorations.${index}`;
    if (!["underline", "overline", "line-through"].includes(decoration.line)
      || !["solid", "double", "dotted", "dashed", "wavy"].includes(decoration.style)
      || decorations.has(decoration.line)) {
      throw new Error(`${item} is invalid or repeated.`);
    }
    decorations.add(decoration.line);
    assertColorPaint(decoration.paint, `${item}.paint`);
    if (decoration.thicknessPx !== undefined) nonNegative(decoration.thicknessPx, `${item}.thicknessPx`);
    if (decoration.offsetPx !== undefined) finite(decoration.offsetPx, `${item}.offsetPx`);
  }
}

function assertRunStyle(style: VisualTextRunStyle | undefined, label: string): void {
  if (style === undefined) return;
  if (style.typography !== undefined) {
    const merged = style.typography;
    if (merged.fonts !== undefined) assertExactFonts(merged.fonts, `${label}.fonts`);
    for (const [name, value] of Object.entries(merged)) {
      if (typeof value === "number") finite(value, `${label}.${name}`);
    }
  }
  for (const [index, paint] of (style.paints ?? []).entries()) assertTextPaint(paint, `${label}.paints.${index}`);
}

function inheritedTypography(
  base: VisualTextTypography,
  style: VisualTextRunStyle | undefined,
): VisualTextTypography {
  const override = style?.typography;
  if (override === undefined) return base;
  const {
    fonts: _fonts,
    axes: _axes,
    features: _features,
    decorations: _decorations,
    cjk: _cjk,
    ...scalarOverrides
  } = override;
  return {
    ...base,
    ...scalarOverrides,
    fonts: override.fonts ?? base.fonts,
    axes: override.axes ?? base.axes,
    features: override.features ?? base.features,
    decorations: override.decorations ?? base.decorations,
    cjk: override.cjk === undefined ? base.cjk : { ...base.cjk, ...override.cjk },
  };
}

function assertTextDocument(
  document: VisualTextDocument,
  typography: VisualTextTypography,
  label: string,
): void {
  if (document.paragraphs.length === 0) throw new Error(`${label} has no paragraphs.`);
  const ids = new Set<string>();
  let hasText = false;
  for (const [paragraphIndex, paragraph] of document.paragraphs.entries()) {
    assertNonEmpty(paragraph.id, `${label}.paragraphs.${paragraphIndex}.id`);
    if (ids.has(paragraph.id) || paragraph.inlines.length === 0) throw new Error(`${label} has an invalid paragraph.`);
    ids.add(paragraph.id);
    assertRunStyle(paragraph.style, `${label}.paragraphs.${paragraphIndex}.style`);
    const paragraphTypography = inheritedTypography(typography, paragraph.style);
    assertTypography(paragraphTypography, `${label}.paragraphs.${paragraphIndex}.typography`);
    for (const [inlineIndex, inline] of paragraph.inlines.entries()) {
      assertNonEmpty(inline.id, `${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.id`);
      if (ids.has(inline.id)) throw new Error(`${label} repeats inline id ${inline.id}.`);
      ids.add(inline.id);
      if (inline.kind === "text") {
        if (inline.text.length === 0) throw new Error(`${label} contains an empty text run.`);
        hasText ||= inline.text.trim().length > 0;
        assertRunStyle(inline.style, `${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.style`);
        const inlineTypography = inheritedTypography(paragraphTypography, inline.style);
        assertTypography(inlineTypography, `${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.typography`);
        if (inline.direction !== undefined && !["auto", "ltr", "rtl"].includes(inline.direction)) {
          throw new Error(`${label}.paragraphs.${paragraphIndex}.inlines.${inlineIndex}.direction is invalid.`);
        }
      } else if (inline.kind !== "break") throw new Error(`${label} contains an unsupported inline.`);
    }
  }
  if (!hasText) throw new Error(`${label} contains no visible text.`);
}

function assertBoxDecoration(decoration: VisualTextBoxDecoration, label: string): void {
  if (decoration.fill !== undefined) assertColorPaint(decoration.fill, `${label}.fill`);
  for (const [name, value] of Object.entries(decoration.paddingPx)) nonNegative(value, `${label}.paddingPx.${name}`);
  for (const [name, value] of Object.entries(decoration.radiiPx)) nonNegative(value, `${label}.radiiPx.${name}`);
  if (decoration.border !== undefined) {
    assertColorPaint(decoration.border.paint, `${label}.border.paint`);
    if (!["solid", "dashed", "dotted"].includes(decoration.border.style)) {
      throw new Error(`${label}.border.style is invalid.`);
    }
    for (const [name, value] of Object.entries(decoration.border.widthsPx)) nonNegative(value, `${label}.border.widthsPx.${name}`);
  }
  for (const [index, shadow] of decoration.shadows.entries()) {
    assertColorPaint(shadow.paint, `${label}.shadows.${index}.paint`);
    finite(shadow.offsetX, `${label}.shadows.${index}.offsetX`);
    finite(shadow.offsetY, `${label}.shadows.${index}.offsetY`);
    nonNegative(shadow.blurPx, `${label}.shadows.${index}.blurPx`);
    finite(shadow.spreadPx, `${label}.shadows.${index}.spreadPx`);
  }
  if (decoration.tail !== undefined) {
    if (!["top", "right", "bottom", "left"].includes(decoration.tail.side)) {
      throw new Error(`${label}.tail.side is invalid.`);
    }
    finite(decoration.tail.offset, `${label}.tail.offset`);
    nonNegative(decoration.tail.widthPx, `${label}.tail.widthPx`);
    nonNegative(decoration.tail.heightPx, `${label}.tail.heightPx`);
    assertColorPaint(decoration.tail.paint, `${label}.tail.paint`);
  }
}

function assertTextPaint(paint: VisualTextPaintLayer, label: string): void {
  if (paint.kind === "fill") return assertColorPaint(paint.paint, `${label}.paint`);
  if (paint.kind === "stroke") {
    assertColorPaint(paint.paint, `${label}.paint`);
    if (!["inside", "center", "outside"].includes(paint.placement)) {
      throw new Error(`${label}.placement is invalid.`);
    }
    return nonNegative(paint.widthPx, `${label}.widthPx`);
  }
  if (paint.kind === "shadow") {
    assertColorPaint(paint.paint, `${label}.paint`);
    finite(paint.offsetX, `${label}.offsetX`);
    finite(paint.offsetY, `${label}.offsetY`);
    nonNegative(paint.blurPx, `${label}.blurPx`);
    finite(paint.spreadPx, `${label}.spreadPx`);
    return;
  }
  if (paint.kind === "glow") {
    assertColorPaint(paint.paint, `${label}.paint`);
    nonNegative(paint.blurPx, `${label}.blurPx`);
    finite(paint.spreadPx, `${label}.spreadPx`);
    return;
  }
  if (paint.kind !== "box") throw new Error(`${label} has an unsupported Paint kind.`);
  if (paint.continuity === "joined" && !["line", "word", "grapheme"].includes(paint.target)) {
    throw new Error(`${label} joined continuity is invalid for ${paint.target}.`);
  }
  assertBoxDecoration(paint.decoration, `${label}.decoration`);
}

/** Validate the reusable renderer-neutral appearance shared by text components. */
export function assertVisualTextAppearance(
  appearance: {
    readonly typography: VisualTextTypography;
    readonly paints: readonly VisualTextPaintLayer[];
  },
  label = "Visual text appearance",
): void {
  assertTypography(appearance.typography, `${label}.typography`);
  const boxKeys = new Set<string>();
  for (const [index, paint] of appearance.paints.entries()) {
    assertTextPaint(paint, `${label}.paints.${index}`);
    if (paint.kind !== "box") continue;
    const key = `${paint.target}:${paint.continuity}`;
    if (boxKeys.has(key)) throw new Error(`${label} repeats Box Paint ${key}.`);
    boxKeys.add(key);
  }
}

function assertTextFlow(flow: VisualTextFlow, label: string): void {
  if (!(["hug", "fixed"] as const).includes(flow.inlineSize)
    || !(["hug", "fixed"] as const).includes(flow.blockSize)
    || !(["start", "center", "end", "justify"] as const).includes(flow.inlineAlign)
    || !(["start", "center", "end"] as const).includes(flow.blockAlign)
    || !(["none", "word", "grapheme"] as const).includes(flow.wrap)
    || !(["visible", "clip", "ellipsis", "shrink"] as const).includes(flow.overflow)
    || !(["line-box", "cap-height", "ink"] as const).includes(flow.metricEdge)) {
    throw new Error(`${label} contains an unsupported flow enum.`);
  }
  if (flow.form.kind === "point" && (flow.inlineSize !== "hug" || flow.blockSize !== "hug" || flow.wrap !== "none")) {
    throw new Error(`${label} Point Text must hug both axes and cannot soft-wrap.`);
  }
  for (const [name, value] of Object.entries(flow.paddingPx)) nonNegative(value, `${label}.paddingPx.${name}`);
  if (!Number.isSafeInteger(flow.columns) || flow.columns <= 0) throw new Error(`${label}.columns must be positive.`);
  nonNegative(flow.columnGapPx, `${label}.columnGapPx`);
  if (flow.maxLines !== undefined && (!Number.isSafeInteger(flow.maxLines) || flow.maxLines <= 0)) {
    throw new Error(`${label}.maxLines must be positive.`);
  }
  if (flow.maxLines !== undefined && flow.overflow !== "ellipsis" && flow.overflow !== "shrink") {
    throw new Error(`${label}.maxLines is valid only for ellipsis or shrink.`);
  }
  if (flow.overflow === "shrink") {
    if (flow.minimumScale === undefined || !Number.isFinite(flow.minimumScale) || flow.minimumScale <= 0 || flow.minimumScale > 1) {
      throw new Error(`${label}.minimumScale is required in (0, 1] for shrink.`);
    }
  } else if (flow.minimumScale !== undefined) throw new Error(`${label}.minimumScale is valid only for shrink.`);
}

function assertTextSequences(
  sequences: readonly VisualTextSequenceAnimation[],
  label: string,
): void {
  const ids = new Set<string>();
  for (const [index, sequence] of sequences.entries()) {
    const item = `${label}.${index}`;
    assertNonEmpty(sequence.id, `${item}.id`);
    if (ids.has(sequence.id)) throw new Error(`${label} repeats ${sequence.id}.`);
    ids.add(sequence.id);
    if (!(["paragraph", "line", "run", "word", "grapheme"] as const).includes(sequence.unit)
      || !(["forward", "reverse", "random"] as const).includes(sequence.order)) {
      throw new Error(`${item} unit or order is invalid.`);
    }
    if (!Number.isSafeInteger(sequence.range.start) || !Number.isSafeInteger(sequence.range.endExclusive)
      || sequence.range.start < 0 || sequence.range.endExclusive <= sequence.range.start
      || !Number.isSafeInteger(sequence.startFrame) || sequence.startFrame < 0
      || !Number.isSafeInteger(sequence.unitDurationFrames) || sequence.unitDurationFrames <= 0
      || !Number.isSafeInteger(sequence.staggerFrames) || sequence.staggerFrames < 0
      || !Number.isSafeInteger(sequence.cycles) || sequence.cycles <= 0
      || (sequence.seed !== undefined && !Number.isSafeInteger(sequence.seed))) {
      throw new Error(`${item} frame domain or range is invalid.`);
    }
    if ((sequence.order === "random") !== (sequence.seed !== undefined)) {
      throw new Error(`${item} random order requires one explicit seed, and other orders forbid it.`);
    }
    if (sequence.keyframes.length < 2 || sequence.keyframes[0]?.atProgress !== 0 || sequence.keyframes.at(-1)?.atProgress !== 1) {
      throw new Error(`${item} keyframes must cover progress [0, 1].`);
    }
    let previous = -1;
    for (const [frameIndex, keyframe] of sequence.keyframes.entries()) {
      if (!Number.isFinite(keyframe.atProgress) || keyframe.atProgress <= previous || keyframe.atProgress < 0 || keyframe.atProgress > 1) {
        throw new Error(`${item}.keyframes.${frameIndex} progress is invalid.`);
      }
      const state = keyframe.state;
      if (Object.keys(state).length === 0) throw new Error(`${item}.keyframes.${frameIndex} has no state.`);
      if (state.opacity !== undefined && (!Number.isFinite(state.opacity) || state.opacity < 0 || state.opacity > 1)) {
        throw new Error(`${item}.keyframes.${frameIndex}.opacity is invalid.`);
      }
      if (state.blurPx !== undefined) nonNegative(state.blurPx, `${item}.keyframes.${frameIndex}.blurPx`);
      if (state.color !== undefined) assertColor(state.color, `${item}.keyframes.${frameIndex}.color`);
      if (state.transform !== undefined) {
        for (const [name, value] of Object.entries(state.transform)) finite(value, `${item}.keyframes.${frameIndex}.transform.${name}`);
        if (state.transform.scale <= 0) throw new Error(`${item}.keyframes.${frameIndex}.transform.scale is invalid.`);
      }
      if (state.clipInsetPercent !== undefined) {
        for (const [name, value] of Object.entries(state.clipInsetPercent)) {
          if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${item}.keyframes.${frameIndex}.clipInsetPercent.${name} is invalid.`);
        }
      }
      previous = keyframe.atProgress;
    }
  }
}

function assertPathCommands(path: readonly VisualVectorPathCommand[], label: string): void {
  if (path.length < 2 || path[0]?.kind !== "move") throw new Error(`${label} must begin with move and contain drawable geometry.`);
  if (!path.some((command) => command.kind === "line" || command.kind === "quadratic" || command.kind === "cubic")) {
    throw new Error(`${label} contains no drawable geometry.`);
  }
  for (const [index, command] of path.entries()) {
    for (const [name, value] of Object.entries(command)) {
      if (name !== "kind") finite(value as number, `${label}.${index}.${name}`);
    }
  }
}

function assertVisualItemBase(item: VisualItemBase, timeline: Timeline | undefined, trackId: string): void {
  const totalFrames = timeline === undefined ? Number.MAX_SAFE_INTEGER : timelineFrameCount(timeline);
  assertNonEmpty(item.id, `${trackId} Visual Item id`);
  if (item.subjectId !== undefined) assertNonEmpty(item.subjectId, `${trackId}.${item.id} subjectId`);
  assertFrameSpan(item.span, totalFrames, `${trackId}.${item.id}.span`);
  let previousEnd = item.span.startFrame;
  for (const span of item.visibility ?? []) {
    assertFrameSpan(span, item.span.endFrameExclusive, `${trackId}.${item.id}.visibility`);
    if (span.startFrame < previousEnd) throw new Error(`${trackId}.${item.id} visibility must be ordered within its span.`);
    previousEnd = span.endFrameExclusive;
  }
}

export function assertVisualProgram(program: VisualProgram, label = "Visual Program"): void {
  assertNonEmpty(program.format, `${label}.format`);
  if (program.payload === null || typeof program.payload !== "object" || Array.isArray(program.payload)) {
    throw new Error(`${label}.payload must be an object.`);
  }
  canonicalStringify(program.payload);
  for (const artifact of program.artifacts) assertMediaArtifact(artifact, `${label}.artifacts`);
}

export function assertAudioReconstructionProgram(
  program: AudioReconstructionProgram,
  label = "Audio Reconstruction Program",
): void {
  if (program === null || typeof program !== "object") throw new Error(`${label} must be an object.`);
  if (typeof program.format !== "string") throw new Error(`${label}.format must be a string.`);
  assertNonEmpty(program.format, `${label}.format`);
  if (program.payload === null || typeof program.payload !== "object" || Array.isArray(program.payload)) {
    throw new Error(`${label}.payload must be an object.`);
  }
  canonicalStringify(program.payload);
  if (!Array.isArray(program.artifacts)) throw new Error(`${label}.artifacts must be an array.`);
  for (const artifact of program.artifacts) assertBlobRef(artifact, `${label}.artifacts`);
}

export function assertAudioProcessProgram(program: AudioProcessProgram, label: string): void {
  assertAudioReconstructionProgram(program, label);
}

function assertElement(
  element: VisualElement,
  present: VisualPresent,
  trackId: string,
  ids: Set<string>,
  timeline?: Timeline,
): void {
  if (element === null || typeof element !== "object" || Array.isArray(element)) {
    throw new Error(`${trackId}.${present.id} contains an invalid element.`);
  }
  assertNonEmpty(element.id, `${trackId}.${present.id} element id`);
  if (ids.has(element.id)) throw new Error(`${trackId}.${present.id} has duplicate element ${element.id}.`);
  ids.add(element.id);
  const label = `${trackId}.${present.id}.${element.id}`;
  if (element.kind === "program") {
    assertVisualProgram(element.program, `${label}.program`);
    if (!Array.isArray(element.slots)) throw new Error(`${label}.slots is invalid.`);
    const names = new Set<string>();
    for (const slot of element.slots) {
      assertNonEmpty(slot.name, `${label} slot name`);
      if (names.has(slot.name)) throw new Error(`${label} has duplicate slot ${slot.name}.`);
      names.add(slot.name);
      assertElement(slot.element, present, trackId, ids, timeline);
    }
    return;
  }
  if (element.kind === "mask") {
    if (!["alpha", "luminance"].includes(element.mode)) throw new Error(`${label} has an invalid local mask.`);
    assertElement(element.mask, present, trackId, ids, timeline);
    assertElement(element.content, present, trackId, ids, timeline);
    const mask = element.mask;
    if (!["text", "text-flow", "path-text", "image", "surface", "program"].includes(mask.kind)
      || (mask.kind === "surface" && mask.surface.timing.kind !== "still")) {
      throw new Error(`${label} mask source must be one terminal owned text, image or still Surface.`);
    }
    return;
  }
  if (element.kind === "image" || element.kind === "video") {
    if (element.kind === "image") {
      assertMediaArtifact(element.artifact, `${label}.artifact`);
      verifyPictureInterpretation(element.picture, `${label}.picture`);
      if (!element.artifact.mediaType.startsWith("image/")) {
        throw new Error(`${label} media kind does not match its Artifact.`);
      }
    } else {
      verifyPreparedVisualSource(element.source);
      assertVisualSampling(element.sampling, `${label}.sampling`, timeline === undefined ? undefined
        : exactTemporalValueFromFrames(present.span.endFrameExclusive - present.span.startFrame, timeline),
      element.source);
    }
    return;
  }
  if (element.kind === "text") {
    assertExactFonts(element.fonts, `${label}.fonts`);
    for (const [index, paint] of (element.paints ?? []).entries()) {
      assertTextPaint(paint, `${label}.paints.${index}`);
      if (paint.kind === "box") throw new Error(`${label}.paints.${index} is Box Paint on a plain text element.`);
    }
    return;
  }
  if (element.kind === "text-flow" || element.kind === "path-text") {
    assertTextDocument(element.document, element.typography, `${label}.document`);
    assertVisualTextAppearance(element, label);
    assertTextSequences(element.sequences, `${label}.sequences`);
    if (element.kind === "text-flow") assertTextFlow(element.flow, `${label}.flow`);
    else {
      assertPathCommands(element.path, `${label}.path`);
      if (!(["left", "right"] as const).includes(element.side)
        || !(["follow", "upright"] as const).includes(element.orientation)
        || !(["start", "center", "end"] as const).includes(element.align)
        || !(["visible", "clip"] as const).includes(element.overflow)) {
        throw new Error(`${label} contains an unsupported Path Text enum.`);
      }
      nonNegative(element.startMarginPx, `${label}.startMarginPx`);
      nonNegative(element.endMarginPx, `${label}.endMarginPx`);
      if (element.marginAnimation !== undefined) {
        const frames = element.marginAnimation.keyframes;
        if (frames.length < 2) throw new Error(`${label}.marginAnimation requires two keyframes.`);
        let previous = -1;
        for (const [index, keyframe] of frames.entries()) {
          if (!Number.isSafeInteger(keyframe.atFrame) || keyframe.atFrame <= previous) {
            throw new Error(`${label}.marginAnimation.${index} has an invalid frame.`);
          }
          nonNegative(keyframe.startMarginPx, `${label}.marginAnimation.${index}.startMarginPx`);
          previous = keyframe.atFrame;
        }
      }
    }
    return;
  }
  if (element.kind === "surface") {
    assertCompositableSurfaceRef(element.surface, `${label}.surface`);
    if (element.surface.timing.kind === "still" && element.sampling !== undefined) {
      throw new Error(`${label} still Surface cannot have temporal sampling.`);
    }
    if (element.sampling !== undefined) {
      if (element.surface.timing.kind !== "frames") throw new Error(`${label} still Surface cannot have temporal sampling.`);
      assertSampling(element.sampling, `${label}.sampling`, timeline === undefined ? undefined
        : exactTemporalValueFromFrames(present.span.endFrameExclusive - present.span.startFrame, timeline),
      exactTemporalValueFromFrames(element.surface.timing.frameCount, { frameRate: element.surface.timing.frameRate }));
    }
    if (element.surface.timing.kind === "frames" && element.sampling === undefined) {
      throw new Error(`${label} timed Surface requires temporal sampling.`);
    }
    return;
  }
  throw new Error(`${label} has invalid element kind ${String((element as { readonly kind?: unknown }).kind)}.`);
}

function assertPresent(present: VisualPresent, timeline: Timeline | undefined, trackId: string): void {
  assertVisualItemBase(present, timeline, trackId);
  assertElement(present.root, present, trackId, new Set(), timeline);
}

function assertVisualContribution(
  contribution: VisualContribution,
  timeline: Timeline | undefined,
  owner: string,
): void {
  if (contribution.kind === "present") {
    assertPresent(contribution, timeline, owner);
    return;
  }
  assertVisualItemBase(contribution, timeline, owner);
  assertVisualProcessEffect(contribution.effect, `${owner}.${contribution.id}.effect`);
  if (!Array.isArray(contribution.inputs) || contribution.inputs.length === 0) {
    throw new Error(`${owner}.${contribution.id} Visual Process requires named inputs.`);
  }
  const names = new Set<string>();
  for (const [index, input] of contribution.inputs.entries()) {
    if (input === null || typeof input !== "object") {
      throw new Error(`${owner}.${contribution.id}.inputs.${index} is invalid.`);
    }
    assertNonEmpty(input.name, `${owner}.${contribution.id}.inputs.${index}.name`);
    if (names.has(input.name)) throw new Error(`${owner}.${contribution.id} repeats input ${input.name}.`);
    names.add(input.name);
    assertVisualContribution(input.contribution, timeline, `${owner}.${contribution.id}.${input.name}`);
  }
  if (names.size !== contribution.effect.inputs.length
    || contribution.effect.inputs.some((name) => !names.has(name))) {
    throw new Error(`${owner}.${contribution.id} inputs do not match its VisualProcessEffect.`);
  }
}

function assertAdjustment(adjustment: VisualAdjustment, timeline: Timeline | undefined, trackId: string): void {
  assertVisualItemBase(adjustment, timeline, trackId);
  assertVisualProgram(adjustment.program, `${trackId}.${adjustment.id}.program`);
}

export function assertVisualTrackIdentity(track: VisualTrack, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (track === null || typeof track !== "object" || Array.isArray(track)) {
    throw new Error("VisualTrack is invalid.");
  }
  if (track.kind !== "visual") throw new Error("VisualTrack kind is invalid.");
  assertNonEmpty(track.timelineId, "VisualTrack timelineId");
  if (timeline !== undefined && track.timelineId !== timeline.id) {
    throw new Error(`VisualTrack ${track.id} belongs to Timeline ${track.timelineId}, not ${timeline.id}.`);
  }
  assertNonEmpty(track.id, "VisualTrack id");
  assertVisualItemSequence(track.items, timeline, track.id);
}

/** Validate one author-owned visual sequence without inventing a Track carrier. */
export function assertVisualItemSequence(
  items: readonly VisualItem[],
  timeline?: Timeline,
  owner = "Visual sequence",
): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (!Array.isArray(items)) throw new Error(`${owner} items are invalid.`);
  const itemIds = new Set<string>();
  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${owner} contains an invalid Visual Item.`);
    }
    if (itemIds.has(item.id)) throw new Error(`${owner} has duplicate Visual Item ${item.id}.`);
    itemIds.add(item.id);
    if (item.kind === "present" || item.kind === "process") assertVisualContribution(item, timeline, owner);
    else if (item.kind === "adjustment") assertAdjustment(item, timeline, owner);
    else throw new Error(`${owner}.${(item as { readonly id?: string }).id ?? "unknown"} has invalid Visual Item kind.`);
  }
}

export function assertAudioTrackIdentity(track: AudioTrack, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (track === null || typeof track !== "object" || Array.isArray(track)) {
    throw new Error("AudioTrack is invalid.");
  }
  if (track.kind !== "audio") throw new Error("AudioTrack kind is invalid.");
  assertNonEmpty(track.timelineId, "AudioTrack timelineId");
  if (timeline !== undefined && track.timelineId !== timeline.id) {
    throw new Error(`AudioTrack ${track.id} belongs to Timeline ${track.timelineId}, not ${timeline.id}.`);
  }
  assertNonEmpty(track.id, "AudioTrack id");
  const totalSamples = timeline === undefined
    ? Number.MAX_SAFE_INTEGER
    : timelineSampleFrames(timeline, 48_000);
  if (track.graph === null || typeof track.graph !== "object" || !Array.isArray(track.graph.nodes)) {
    throw new Error(`AudioTrack ${track.id} graph is invalid.`);
  }
  const nodes = new Map<string, AudioGraphNode>();
  const clipIds = new Set<string>();
  const references = new Map<string, readonly AudioSignalRef[]>();
  for (const node of track.graph.nodes) {
    assertNonEmpty(node.id, `${track.id} Audio node id`);
    if (nodes.has(node.id)) throw new Error(`${track.id} has duplicate Audio node ${node.id}.`);
    nodes.set(node.id, node);
    if (node.kind === "silence") {
      references.set(node.id, []);
      continue;
    }
    if (node.kind === "source") {
      references.set(node.id, []);
      const clip = node.clip;
    if (clipIds.has(clip.id)) throw new Error(`${track.id} has duplicate clip ${clip.id}.`);
    clipIds.add(clip.id);
    assertNonEmpty(clip.id, `${track.id} clip id`);
    if (clip.subjectId !== undefined) assertNonEmpty(clip.subjectId, `${track.id}.${clip.id} subjectId`);
    verifyPreparedAudioSource(clip.source);
    assertSampling(clip.preparation, `${track.id}.${clip.id}.preparation`, undefined, clip.source.sourceDomain.duration);
    if (clip.preparation.stages.at(-1)!.source.id !== clip.source.sourceDomain.id) {
      throw new Error(`${track.id}.${clip.id}.preparation source domain differs from its selected audio source.`);
    }
    const zero = exactTemporalZero();
    const timelineDuration = timeline === undefined ? undefined : exactTemporalValueFromFrames(timeline.frameCount, timeline);
    if (compareExactTemporalValues(clip.target.start, zero) < 0
      || compareExactTemporalValues(clip.target.start, clip.target.end) >= 0
      || (timelineDuration !== undefined && compareExactTemporalValues(clip.target.end, timelineDuration) > 0)) {
      throw new Error(`${track.id}.${clip.id} target interval is outside Timeline.`);
    }
    const targetDuration = subtractExactTemporalValues(clip.target.end, clip.target.start);
    assertSampling(clip.sampling, `${track.id}.${clip.id}.sampling`, targetDuration);
    if (clip.reconstruction !== undefined) {
      assertAudioReconstructionProgram(clip.reconstruction, `${track.id}.${clip.id}.reconstruction`);
    }
    const preparedDomain = clip.preparation.stages[0]!.target;
    if (compareExactTemporalValues(clip.sampling.stages.at(-1)!.source.duration,
      preparedDomain.duration) !== 0
      || clip.sampling.stages.at(-1)!.source.id !== preparedDomain.id) {
      throw new Error(`${track.id}.${clip.id}.sampling source domain differs from its prepared audio domain.`);
    }
    if (!Number.isFinite(clip.gain) || clip.gain < 0) {
      throw new Error(`${track.id}.${clip.id} gain is invalid.`);
    }
    const targetSamples = {
      startSample: resolveTemporalBoundary(clip.target.start,
        { frameRate: { numerator: 48_000, denominator: 1 } }, "nearest"),
      endSampleExclusive: resolveTemporalBoundary(clip.target.end,
        { frameRate: { numerator: 48_000, denominator: 1 } }, "nearest"),
    };
    assertAudioLevelAutomation(clip, targetSamples, totalSamples);
    if (compareExactTemporalValues(clip.fadeIn, zero) < 0
      || compareExactTemporalValues(clip.fadeIn, targetDuration) > 0
      || compareExactTemporalValues(clip.fadeOut, zero) < 0
      || compareExactTemporalValues(clip.fadeOut, targetDuration) > 0) {
      throw new Error(`${track.id}.${clip.id} fades are invalid.`);
    }
      continue;
    }
    if (node.kind === "mix") {
      if (!Array.isArray(node.inputs) || node.inputs.length === 0) throw new Error(`${track.id}.${node.id} Mix has no inputs.`);
      references.set(node.id, node.inputs);
      continue;
    }
    if (node.kind !== "process" || node.inputs === null || typeof node.inputs !== "object"
      || node.inputs.signal === undefined) {
      throw new Error(`${track.id}.${node.id} Process is invalid.`);
    }
    assertAudioProcessProgram(node.program, `${track.id}.${node.id}.program`);
    references.set(node.id, Object.values(node.inputs));
  }
  const assertRef = (reference: AudioSignalRef, label: string): void => {
    if (reference?.port !== "signal" || !nodes.has(reference.node)) throw new Error(`${label} is invalid.`);
  };
  assertRef(track.graph.output, `${track.id}.graph.output`);
  for (const [node, inputs] of references) for (const [index, reference] of inputs.entries()) {
    assertRef(reference, `${track.id}.${node}.inputs.${index}`);
  }
  const state = new Map<string, "visiting" | "visited">();
  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (state.get(id) === "visiting") throw new Error(`${track.id} Audio graph contains a cycle at ${id}.`);
    if (state.get(id) === "visited") return;
    state.set(id, "visiting");
    reachable.add(id);
    for (const input of references.get(id) ?? []) visit(input.node);
    state.set(id, "visited");
  };
  visit(track.graph.output.node);
  if (reachable.size !== nodes.size) throw new Error(`${track.id} Audio graph contains unreachable nodes.`);
  }

export function assertVisualProcessEffect(value: VisualProcessEffect, label = "VisualProcessEffect"): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.inputs)) {
    throw new Error(`${label} is invalid.`);
  }
  if (value.inputs.length === 0) throw new Error(`${label} requires named inputs.`);
  const names = new Set<string>();
  for (const [index, name] of value.inputs.entries()) {
    assertNonEmpty(name, `${label}.inputs.${index}`);
    if (names.has(name)) throw new Error(`${label} repeats input ${name}.`);
    names.add(name);
  }
  assertVisualProgram(value.program, `${label}.program`);
}

export function sealVisualProcessEffect(value: VisualProcessEffect): VisualProcessEffect {
  assertVisualProcessEffect(value);
  return {
    inputs: [...value.inputs],
    program: structuredClone(value.program),
  };
}

function visualContributionHasPresent(contribution: VisualContribution): boolean {
  return contribution.kind === "present"
    || contribution.inputs.some((input) => visualContributionHasPresent(input.contribution));
}

function visualScopeHasPresent(scope: VisualScope): boolean {
  return scope.members.some((member) => {
    if (member.kind === "track") {
      return member.track.items.some((item) => item.kind !== "adjustment" && visualContributionHasPresent(item));
    }
    if (member.kind === "stack") return visualScopeHasPresent(member.scope);
    return member.inputs.some((input) => visualScopeHasPresent(input.scope));
  });
}

function assertVisualScope(
  scope: VisualScope,
  timeline: Timeline | undefined,
  label: string,
): void {
  if (scope === null || typeof scope !== "object" || !Array.isArray(scope.members)) {
    throw new Error(`${label} is invalid.`);
  }
  const memberIds = new Set<string>();
  for (const [index, member] of scope.members.entries()) {
    const memberLabel = `${label}.members.${index}`;
    if (member === null || typeof member !== "object") throw new Error(`${memberLabel} is invalid.`);
    assertNonEmpty(member.id, `${memberLabel} id`);
    if (memberIds.has(member.id)) throw new Error(`${label} contains duplicate member id ${member.id}.`);
    memberIds.add(member.id);
    if (member.kind === "track") {
      assertVisualTrackIdentity(member.track, timeline);
      continue;
    }
    if (member.kind === "stack") {
      assertVisualScope(member.scope, timeline, `${memberLabel}.scope`);
      if (!visualScopeHasPresent(member.scope)) {
        throw new Error(`${memberLabel} must contain a source-owning Present.`);
      }
      continue;
    }
    if (member.kind !== "process" || !Array.isArray(member.inputs) || member.inputs.length === 0) {
      throw new Error(`${memberLabel}.kind is invalid.`);
    }
    assertVisualProcessEffect(member.effect, `${memberLabel}.effect`);
    const inputNames = new Set<string>();
    for (const [inputIndex, input] of member.inputs.entries()) {
      const inputLabel = `${memberLabel}.inputs.${inputIndex}`;
      if (input === null || typeof input !== "object") throw new Error(`${inputLabel} is invalid.`);
      assertNonEmpty(input.name, `${inputLabel}.name`);
      if (inputNames.has(input.name)) throw new Error(`${memberLabel} repeats input ${input.name}.`);
      inputNames.add(input.name);
      assertVisualScope(input.scope, timeline, `${inputLabel}.scope`);
      if (!visualScopeHasPresent(input.scope)) {
        throw new Error(`${inputLabel} must contain a source-owning Present.`);
      }
    }
    if (inputNames.size !== member.effect.inputs.length
      || member.effect.inputs.some((name: string) => !inputNames.has(name))) {
      throw new Error(`${memberLabel} inputs do not match its VisualProcessEffect.`);
    }
  }
}

export function assertVisualScopeIdentity(scope: VisualScope, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  assertVisualScope(scope, timeline, "VisualScope");
}

export function assertVisualCompositionIdentity(composition: VisualComposition, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (
    composition === null
    || typeof composition !== "object"
    || Array.isArray(composition)
    || composition.canvas === null
    || typeof composition.canvas !== "object"
    || Array.isArray(composition.canvas)
    || !Number.isSafeInteger(composition.canvas.width)
    || composition.canvas.width <= 0
    || !Number.isSafeInteger(composition.canvas.height)
    || composition.canvas.height <= 0
    || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(composition.canvas.clearColor)
  ) throw new Error("VisualComposition canvas is invalid.");
  assertVisualScope(composition.root, timeline, "VisualComposition.root");
}

export function assertAudioCompositionIdentity(composition: AudioComposition, timeline?: Timeline): void {
  if (timeline !== undefined) assertTimelineIdentity(timeline);
  if (composition === null || typeof composition !== "object" || Array.isArray(composition)
    || !Array.isArray(composition.contributions)) throw new Error("AudioComposition is invalid.");
  for (const track of composition.contributions) assertAudioTrackIdentity(track, timeline);
}

export function assertCompositionIdentity(composition: Composition): void {
  if (composition === null || typeof composition !== "object" || Array.isArray(composition)) {
    throw new Error("Composition is invalid.");
  }
  assertNonEmpty(composition.id, "Composition id");
  assertTimelineIdentity(composition.timeline);
  assertVisualCompositionIdentity(composition.visual, composition.timeline);
  assertAudioCompositionIdentity(composition.audio, composition.timeline);
}
