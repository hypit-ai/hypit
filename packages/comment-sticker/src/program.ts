import {
  assertVisualTrackIdentity,
  sealVisualTrack,
} from "@narratage/composition";
import type {
  VisualAnimation,
  VisualElement,
  VisualStyleDeclaration,
  VisualTextFlow,
  VisualTextTypography,
  VisualTrack,
} from "@narratage/composition";
import { assertFontArtifactRef } from "@narratage/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import { assertProgramSpaceIdentity } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { BlobRef } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { assertCanvasSpace, assertSpatialFrame } from "@narratage/spatial";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";
import {
  projectMomentWindows,
  projectProgramWindow,
  projectSelectionWindows,
} from "@narratage/temporal";
import type { ProjectedOccurrence } from "@narratage/temporal";
import { verifyText } from "@narratage/text";
import type { Text } from "@narratage/text";

import type {
  CommentStickerContent,
  CommentStickerHeader,
  CommentStickerItemProgram,
  CommentStickerItemSpec,
  CommentStickerProgram,
  CommentStickerSet,
  CommentStickerStyle,
  CommentStickerTextStyle,
} from "./types.js";

export const commentStickerImplementationDigests = {
  createSet: digestOf("@narratage/comment-sticker/create-set@1"),
  appendProgram: digestOf("@narratage/comment-sticker/append-program@1"),
  appendProgramAvatar: digestOf("@narratage/comment-sticker/append-program-avatar@1"),
  appendSelection: digestOf("@narratage/comment-sticker/append-selection@1"),
  appendSelectionAvatar: digestOf("@narratage/comment-sticker/append-selection-avatar@1"),
  appendMoment: digestOf("@narratage/comment-sticker/append-moment@1"),
  appendMomentAvatar: digestOf("@narratage/comment-sticker/append-moment-avatar@1"),
  createContent: digestOf("@narratage/comment-sticker/create-content@1"),
  setContentAuthor: digestOf("@narratage/comment-sticker/set-content-author@1"),
  setContentHeader: digestOf("@narratage/comment-sticker/set-content-header@1"),
  setContentMeta: digestOf("@narratage/comment-sticker/set-content-meta@1"),
  finalize: digestOf("@narratage/comment-sticker/finalize@1"),
  render: digestOf("@narratage/comment-sticker/render@1"),
} as const;

export const commentStickerValidatorDigests = {
  program: digestOf("@narratage/comment-sticker/validate-program@1"),
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function nonNegative(value: number, label: string): void {
  finite(value, label);
  assert(value >= 0, `${label} must be non-negative.`);
}

function positive(value: number, label: string): void {
  finite(value, label);
  assert(value > 0, `${label} must be positive.`);
}

function integer(value: number, label: string, minimum = 0): void {
  assert(Number.isSafeInteger(value) && value >= minimum, `${label} must be an integer at least ${minimum}.`);
}

function color(value: string, label: string): void {
  assert(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} must be a six- or eight-digit hexadecimal color.`);
}

function optionalText(value: string | undefined, label: string): void {
  if (value !== undefined) assert(value.trim().length > 0, `${label} cannot be blank.`);
}

function assertTextStyle(value: CommentStickerTextStyle, label: string): void {
  assert(value.fonts.length > 0, `${label} requires exact fonts.`);
  value.fonts.forEach((font, index) => assertFontArtifactRef(font, `${label}.fonts.${index + 1}`));
  positive(value.sizePx, `${label}.sizePx`);
  integer(value.weight, `${label}.weight`, 1);
  assert(value.weight <= 1_000, `${label}.weight exceeds 1000.`);
  positive(value.lineHeight, `${label}.lineHeight`);
  color(value.color, `${label}.color`);
}

export function assertCommentStickerStyle(value: CommentStickerStyle): void {
  assert(value.contract === "svml.comment-sticker-style@1", "Unsupported CommentStickerStyle contract.");
  identity(value.id, "CommentStickerStyle.id");
  assert(Number.isSafeInteger(value.stackingOrder), "CommentStickerStyle.stackingOrder must be an integer.");
  color(value.card.background, "CommentStickerStyle.card.background");
  color(value.card.borderColor, "CommentStickerStyle.card.borderColor");
  nonNegative(value.card.borderWidthPx, "CommentStickerStyle.card.borderWidthPx");
  nonNegative(value.card.radiusPx, "CommentStickerStyle.card.radiusPx");
  nonNegative(value.card.paddingXPx, "CommentStickerStyle.card.paddingXPx");
  nonNegative(value.card.paddingYPx, "CommentStickerStyle.card.paddingYPx");
  nonNegative(value.card.gapPx, "CommentStickerStyle.card.gapPx");
  finite(value.card.rotationDeg, "CommentStickerStyle.card.rotationDeg");
  color(value.card.shadow.color, "CommentStickerStyle.card.shadow.color");
  finite(value.card.shadow.offsetX, "CommentStickerStyle.card.shadow.offsetX");
  finite(value.card.shadow.offsetY, "CommentStickerStyle.card.shadow.offsetY");
  nonNegative(value.card.shadow.blurPx, "CommentStickerStyle.card.shadow.blurPx");
  finite(value.card.shadow.spreadPx, "CommentStickerStyle.card.shadow.spreadPx");
  nonNegative(value.card.tail.widthPx, "CommentStickerStyle.card.tail.widthPx");
  nonNegative(value.card.tail.heightPx, "CommentStickerStyle.card.tail.heightPx");
  nonNegative(value.card.tail.offsetXPx, "CommentStickerStyle.card.tail.offsetXPx");
  assert(value.avatar.fallback === "none" || value.avatar.fallback === "initial", "CommentStickerStyle avatar fallback is invalid.");
  positive(value.avatar.sizePx, "CommentStickerStyle.avatar.sizePx");
  nonNegative(value.avatar.borderWidthPx, "CommentStickerStyle.avatar.borderWidthPx");
  color(value.avatar.borderColor, "CommentStickerStyle.avatar.borderColor");
  color(value.avatar.background, "CommentStickerStyle.avatar.background");
  color(value.avatar.textColor, "CommentStickerStyle.avatar.textColor");
  assertTextStyle(value.header, "CommentStickerStyle.header");
  assertTextStyle(value.body, "CommentStickerStyle.body");
  integer(value.body.maxLines, "CommentStickerStyle.body.maxLines", 1);
  assertTextStyle(value.meta, "CommentStickerStyle.meta");
  assert(["none", "fade", "pop", "slide-pop"].includes(value.motion.enter.kind), "CommentStickerStyle enter kind is invalid.");
  integer(value.motion.enter.durationFrames, "CommentStickerStyle enter duration");
  finite(value.motion.enter.offsetYPx, "CommentStickerStyle enter offset");
  positive(value.motion.enter.startScale, "CommentStickerStyle enter scale");
  finite(value.motion.enter.rotationDeltaDeg, "CommentStickerStyle enter rotation");
  assert(["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.motion.enter.easing), "CommentStickerStyle enter easing is invalid.");
  assert(["none", "fade", "fade-up"].includes(value.motion.exit.kind), "CommentStickerStyle exit kind is invalid.");
  integer(value.motion.exit.durationFrames, "CommentStickerStyle exit duration");
  finite(value.motion.exit.offsetYPx, "CommentStickerStyle exit offset");
  assert(["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.motion.exit.easing), "CommentStickerStyle exit easing is invalid.");
  assert(value.motion.hold.kind === "none" || value.motion.hold.kind === "float", "CommentStickerStyle hold kind is invalid.");
  nonNegative(value.motion.hold.amplitudeYPx, "CommentStickerStyle hold amplitude");
  nonNegative(value.motion.hold.rotationAmplitudeDeg, "CommentStickerStyle hold rotation");
  integer(value.motion.hold.periodFrames, "CommentStickerStyle hold period", 1);
}

export function sealCommentStickerStyle(value: CommentStickerStyle): CommentStickerStyle {
  assertCommentStickerStyle(value);
  return canonicalize(value) as unknown as CommentStickerStyle;
}

export function assertCommentStickerContent(value: CommentStickerContent): void {
  assert(value.contract === "svml.comment-sticker-content@1", "Unsupported CommentStickerContent contract.");
  assert(value.comment.trim().length > 0, "Comment Sticker comment cannot be blank.");
  optionalText(value.author, "Comment Sticker author");
  optionalText(value.header, "Comment Sticker header");
  optionalText(value.meta, "Comment Sticker meta");
}

export function createCommentStickerContent(comment: Text): CommentStickerContent {
  verifyText(comment);
  const value: CommentStickerContent = { contract: "svml.comment-sticker-content@1", comment: comment.value };
  assertCommentStickerContent(value);
  return canonicalize(value) as unknown as CommentStickerContent;
}

export function setCommentStickerContentText(
  content: CommentStickerContent,
  field: "author" | "header" | "meta",
  value: Text,
): CommentStickerContent {
  assertCommentStickerContent(content);
  verifyText(value);
  const result = { ...structuredClone(content), [field]: value.value };
  assertCommentStickerContent(result);
  return canonicalize(result) as unknown as CommentStickerContent;
}

function assertAvatar(value: BlobRef): void {
  assert(value.kind === "blob" && isDigest(value.digest), "Comment Sticker avatar is not a BlobRef.");
  integer(value.size, "Comment Sticker avatar size");
  assert(value.mediaType.startsWith("image/"), "Comment Sticker avatar must be an image Artifact.");
}

export function assertCommentStickerHeader(value: CommentStickerHeader): void {
  assert(value.contract === "svml.comment-sticker-header@1", "Unsupported CommentStickerHeader contract.");
  identity(value.id, "CommentStickerHeader.id");
}

export function sealCommentStickerHeader(value: CommentStickerHeader): CommentStickerHeader {
  assertCommentStickerHeader(value);
  return canonicalize(value) as unknown as CommentStickerHeader;
}

export function assertCommentStickerItemSpec(value: CommentStickerItemSpec): void {
  assert(value.contract === "svml.comment-sticker-item-spec@1", "Unsupported CommentStickerItemSpec contract.");
  identity(value.id, "CommentStickerItemSpec.id");
  assert(value.expansion.kind === "one" || value.expansion.kind === "each", "CommentStickerItemSpec expansion is invalid.");
}

export function sealCommentStickerItemSpec(value: CommentStickerItemSpec): CommentStickerItemSpec {
  assertCommentStickerItemSpec(value);
  return canonicalize(value) as unknown as CommentStickerItemSpec;
}

export function createCommentStickerSet(): CommentStickerSet {
  return { contract: "svml.comment-sticker-set@1", items: [] };
}

export function assertCommentStickerSet(value: CommentStickerSet): void {
  assert(value.contract === "svml.comment-sticker-set@1" && Array.isArray(value.items), "CommentStickerSet is invalid.");
}

function realized(
  set: CommentStickerSet,
  header: CommentStickerHeader,
  frame: SpatialFrame,
  style: CommentStickerStyle,
  spec: CommentStickerItemSpec,
  content: CommentStickerContent,
  occurrences: readonly ProjectedOccurrence[],
  avatar?: BlobRef,
): CommentStickerSet {
  assertCommentStickerSet(set);
  assertCommentStickerHeader(header);
  assertSpatialFrame(frame);
  assertCommentStickerStyle(style);
  assertCommentStickerItemSpec(spec);
  assertCommentStickerContent(content);
  if (avatar !== undefined) assertAvatar(avatar);
  const additions = occurrences.map((occurrence, index): CommentStickerItemProgram => ({
    id: occurrence.id,
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    span: { ...occurrence.span },
    frame: structuredClone(frame),
    style: structuredClone(style),
    content: structuredClone(content),
    ...(avatar === undefined ? {} : { avatar: structuredClone(avatar) }),
    tieBreak: `${header.id}:${spec.id}:${index + 1}`,
  }));
  const ids = new Set(set.items.map((item) => item.id));
  for (const item of additions) {
    assert(!ids.has(item.id), `Comment Sticker already contains Item ${item.id}.`);
    ids.add(item.id);
  }
  return { contract: "svml.comment-sticker-set@1", items: [...set.items, ...additions] };
}

export function appendProgramCommentSticker(
  set: CommentStickerSet,
  header: CommentStickerHeader,
  frame: SpatialFrame,
  style: CommentStickerStyle,
  space: ProgramSpace,
  spec: CommentStickerItemSpec,
  content: CommentStickerContent,
  avatar?: BlobRef,
): CommentStickerSet {
  assert(spec.expansion.kind === "one", `Program Comment Sticker ${spec.id} must use one occurrence.`);
  return realized(set, header, frame, style, spec, content, [projectProgramWindow({ itemId: spec.id, space, projection: spec.projection })], avatar);
}

export function appendSelectionCommentSticker(
  set: CommentStickerSet,
  header: CommentStickerHeader,
  frame: SpatialFrame,
  style: CommentStickerStyle,
  space: ProgramSpace,
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  spec: CommentStickerItemSpec,
  content: CommentStickerContent,
  avatar?: BlobRef,
): CommentStickerSet {
  return realized(set, header, frame, style, spec, content,
    projectSelectionWindows({ itemId: spec.id, map, selection, space, expansion: spec.expansion, projection: spec.projection }), avatar);
}

export function appendMomentCommentSticker(
  set: CommentStickerSet,
  header: CommentStickerHeader,
  frame: SpatialFrame,
  style: CommentStickerStyle,
  space: ProgramSpace,
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
  spec: CommentStickerItemSpec,
  content: CommentStickerContent,
  avatar?: BlobRef,
): CommentStickerSet {
  return realized(set, header, frame, style, spec, content,
    projectMomentWindows({ itemId: spec.id, map, moment, space, expansion: spec.expansion, projection: spec.projection }), avatar);
}

export function assertCommentStickerProgram(value: CommentStickerProgram): void {
  assert(value.contract === "svml.comment-sticker-program@1", "Unsupported CommentStickerProgram contract.");
  identity(value.id, "CommentStickerProgram.id");
  assert(value.items.length > 0, "CommentStickerProgram requires Items.");
  const ids = new Set<string>();
  for (const item of value.items) {
    identity(item.id, "CommentStickerItemProgram.id");
    assert(!ids.has(item.id), `Duplicate Comment Sticker Item ${item.id}.`);
    ids.add(item.id);
    assert(item.sourceOccurrenceId.length > 0, `Comment Sticker Item ${item.id} source occurrence is empty.`);
    assert(item.span.startFrame >= 0 && item.span.endFrameExclusive > item.span.startFrame,
      `Comment Sticker Item ${item.id} timing is invalid.`);
    assertSpatialFrame(item.frame);
    assertCommentStickerStyle(item.style);
    assertCommentStickerContent(item.content);
    if (item.avatar !== undefined) assertAvatar(item.avatar);
    assert(item.tieBreak.length > 0, `Comment Sticker Item ${item.id} tie break is empty.`);
  }
}

export function sealCommentStickerProgram(value: CommentStickerProgram): CommentStickerProgram {
  assertCommentStickerProgram(value);
  return canonicalize(value) as unknown as CommentStickerProgram;
}

export function finalizeCommentSticker(set: CommentStickerSet, header: CommentStickerHeader): CommentStickerProgram {
  assertCommentStickerSet(set);
  assertCommentStickerHeader(header);
  assert(set.items.length > 0, "Comment Sticker requires at least one Item.");
  return sealCommentStickerProgram({ contract: "svml.comment-sticker-program@1", id: header.id, items: set.items });
}

function px(value: number): string {
  return `${Number(value.toFixed(6))}px`;
}

function transform(y: number, rotation: number, scale: number): string {
  return `translate3d(0px,${px(y)},0) rotate(${Number(rotation.toFixed(6))}deg) scale(${Number(scale.toFixed(6))})`;
}

function motionAnimation(style: CommentStickerStyle, duration: number): VisualAnimation | undefined {
  const enterDuration = style.motion.enter.kind === "none" ? 0 : style.motion.enter.durationFrames;
  const exitDuration = style.motion.exit.kind === "none" ? 0 : style.motion.exit.durationFrames;
  assert(enterDuration + exitDuration <= duration, "Comment Sticker enter and exit motion exceed its projected window.");
  if (enterDuration === 0 && exitDuration === 0 && style.motion.hold.kind === "none") return undefined;
  const frames = new Map<number, { easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out"; opacity: number; y: number; rotation: number; scale: number }>();
  const baseRotation = style.card.rotationDeg;
  const put = (atFrame: number, value: { easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out"; opacity: number; y: number; rotation: number; scale: number }) => {
    frames.set(atFrame, value);
  };
  if (enterDuration > 0) {
    const enter = style.motion.enter;
    put(0, {
      opacity: enter.kind === "fade" ? 0 : 0,
      y: enter.kind === "slide-pop" ? enter.offsetYPx : 0,
      rotation: enter.kind === "fade" ? baseRotation : baseRotation + enter.rotationDeltaDeg,
      scale: enter.kind === "fade" ? 1 : enter.startScale,
    });
    put(enterDuration, { easing: enter.easing, opacity: 1, y: 0, rotation: baseRotation, scale: 1 });
  } else {
    put(0, { opacity: 1, y: 0, rotation: baseRotation, scale: 1 });
  }
  const exitStart = duration - exitDuration;
  if (style.motion.hold.kind === "float" && exitStart > enterDuration) {
    const quarter = Math.max(1, Math.round(style.motion.hold.periodFrames / 4));
    for (let frame = enterDuration + quarter; frame < exitStart; frame += quarter) {
      const phase = (frame - enterDuration) / style.motion.hold.periodFrames * Math.PI * 2;
      put(frame, {
        easing: "ease-in-out",
        opacity: 1,
        y: Math.sin(phase) * style.motion.hold.amplitudeYPx,
        rotation: baseRotation + Math.sin(phase) * style.motion.hold.rotationAmplitudeDeg,
        scale: 1,
      });
    }
    put(exitStart, { easing: "ease-in-out", opacity: 1, y: 0, rotation: baseRotation, scale: 1 });
  }
  if (exitDuration > 0) {
    put(exitStart, { opacity: 1, y: 0, rotation: baseRotation, scale: 1 });
    put(duration, {
      easing: style.motion.exit.easing,
      opacity: 0,
      y: style.motion.exit.kind === "fade-up" ? style.motion.exit.offsetYPx : 0,
      rotation: baseRotation,
      scale: 1,
    });
  } else if (!frames.has(duration)) {
    put(duration, { opacity: 1, y: 0, rotation: baseRotation, scale: 1 });
  }
  return {
    keyframes: [...frames].sort(([left], [right]) => left - right).map(([atFrame, value]) => ({
      atFrame,
      ...(value.easing === undefined ? {} : { easing: value.easing }),
      style: [
        { name: "opacity", value: value.opacity },
        { name: "transform", value: transform(value.y, value.rotation, value.scale) },
      ],
    })),
  };
}

function typography(value: CommentStickerTextStyle): VisualTextTypography {
  const primary = value.fonts[0]!;
  return {
    fonts: structuredClone(value.fonts),
    sizePx: value.sizePx,
    weight: value.weight,
    style: primary.style,
    axes: [],
    features: [],
    synthesis: value.weight === primary.weight ? "none" : "weight",
    kerning: "normal",
    trackingPx: 0,
    wordSpacingPx: 0,
    lineHeight: value.lineHeight,
    direction: "auto",
    writingMode: "horizontal-tb",
    baselineShiftPx: 0,
    tabSize: 4,
    indentationPx: 0,
    paragraphBeforePx: 0,
    paragraphAfterPx: 0,
    transform: "none",
    variantCaps: "normal",
    verticalAlign: "baseline",
    decorations: [],
    cjk: { textSpacing: "normal", punctuationTrim: "none" },
  };
}

function textElement(input: {
  readonly id: string;
  readonly parent: string;
  readonly order: number;
  readonly text: string;
  readonly style: CommentStickerTextStyle;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly align?: "left" | "center";
}): VisualElement {
  return {
    id: input.id,
    parent: input.parent,
    order: input.order,
    kind: "text-flow",
    document: { paragraphs: [{ id: `${input.id}-paragraph`, inlines: [{ kind: "text", id: `${input.id}-copy`, text: input.text }] }] },
    typography: typography(input.style),
    paints: [{ kind: "fill", paint: { kind: "solid", color: input.style.color } }],
    flow: {
      form: { kind: "area" }, inlineSize: "fixed", blockSize: "fixed",
      paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
      inlineAlign: input.align === "center" ? "center" : "start", blockAlign: "start",
      wrap: "none", overflow: "ellipsis", maxLines: 1, clipToFrame: true,
      columns: 1, columnGapPx: 0, metricEdge: "line-box",
    },
    sequences: [],
    style: [
      { name: "height", value: px(input.height) },
      { name: "left", value: px(input.x) },
      { name: "overflow", value: "hidden" },
      { name: "position", value: "absolute" },
      { name: "top", value: px(input.y) },
      { name: "width", value: px(input.width) },
    ],
  };
}

function bodyElement(input: {
  readonly parent: string;
  readonly text: string;
  readonly style: CommentStickerStyle["body"];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): VisualElement {
  const flow: VisualTextFlow = {
    form: { kind: "area" },
    inlineSize: "fixed",
    blockSize: "fixed",
    paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
    inlineAlign: "start",
    blockAlign: "start",
    wrap: "word",
    overflow: "ellipsis",
    maxLines: input.style.maxLines,
    clipToFrame: true,
    columns: 1,
    columnGapPx: 0,
    metricEdge: "line-box",
  };
  return {
    id: "body",
    parent: input.parent,
    order: 6,
    kind: "text-flow",
    document: { paragraphs: [{ id: "body-paragraph", inlines: [{ kind: "text", id: "body-copy", text: input.text }] }] },
    typography: typography(input.style),
    paints: [{ kind: "fill", paint: { kind: "solid", color: input.style.color } }],
    flow,
    sequences: [],
    style: [
      { name: "height", value: px(input.height) },
      { name: "left", value: px(input.x) },
      { name: "position", value: "absolute" },
      { name: "top", value: px(input.y) },
      { name: "width", value: px(input.width) },
    ],
  };
}

function displayHeader(content: CommentStickerContent): string {
  if (content.header !== undefined) return content.header;
  if (content.author === undefined) return "Reply to comment";
  const author = content.author.replace(/^@/u, "");
  return `Reply to @${author}'s comment`;
}

function initial(author: string): string {
  return [...author.replace(/^@/u, "").trim()][0]?.toUpperCase() ?? "";
}

function stickerElements(item: CommentStickerItemProgram): readonly VisualElement[] {
  const { style, frame, content } = item;
  const duration = item.span.endFrameExclusive - item.span.startFrame;
  const tailHeight = style.card.tail.enabled ? style.card.tail.heightPx : 0;
  const cardHeight = frame.heightPx - tailHeight;
  assert(cardHeight > 0, `Comment Sticker ${item.id} frame is shorter than its tail.`);
  const showInitial = item.avatar === undefined && style.avatar.fallback === "initial" && content.author !== undefined;
  const showAvatar = item.avatar !== undefined || showInitial;
  const avatarWidth = showAvatar ? style.avatar.sizePx + style.card.gapPx : 0;
  const contentX = style.card.paddingXPx + avatarWidth;
  const contentWidth = frame.widthPx - contentX - style.card.paddingXPx;
  assert(contentWidth > 0, `Comment Sticker ${item.id} frame is too narrow for its padding and avatar.`);
  const headerHeight = style.header.sizePx * style.header.lineHeight;
  const metaHeight = content.meta === undefined ? 0 : style.meta.sizePx * style.meta.lineHeight;
  const headerY = style.card.paddingYPx;
  const bodyY = headerY + headerHeight + style.card.gapPx * 0.55;
  const bodyBottom = style.card.paddingYPx + (content.meta === undefined ? 0 : metaHeight + style.card.gapPx * 0.55);
  const bodyHeight = cardHeight - bodyY - bodyBottom;
  assert(bodyHeight > 0, `Comment Sticker ${item.id} frame is too short for its text.`);
  const animation = motionAnimation(style, duration);
  const elements: VisualElement[] = [{
    id: "root",
    order: 0,
    kind: "box",
    style: [
      { name: "height", value: px(frame.heightPx) },
      { name: "left", value: px(frame.xPx) },
      { name: "overflow", value: "visible" },
      { name: "position", value: "absolute" },
      { name: "top", value: px(frame.yPx) },
      { name: "transform", value: transform(0, style.card.rotationDeg, 1) },
      { name: "transform-origin", value: "center center" },
      { name: "width", value: px(frame.widthPx) },
    ],
    ...(animation === undefined ? {} : { animation }),
  }, {
    id: "card",
    parent: "root",
    order: 1,
    kind: "box",
    style: [
      { name: "background-color", value: style.card.background },
      { name: "border", value: `${px(style.card.borderWidthPx)} solid ${style.card.borderColor}` },
      { name: "border-radius", value: px(style.card.radiusPx) },
      { name: "box-shadow", value: `${px(style.card.shadow.offsetX)} ${px(style.card.shadow.offsetY)} ${px(style.card.shadow.blurPx)} ${px(style.card.shadow.spreadPx)} ${style.card.shadow.color}` },
      { name: "box-sizing", value: "border-box" },
      { name: "height", value: px(cardHeight) },
      { name: "left", value: "0px" },
      { name: "overflow", value: "hidden" },
      { name: "position", value: "absolute" },
      { name: "top", value: "0px" },
      { name: "width", value: "100%" },
    ],
  }];
  if (style.card.tail.enabled) {
    elements.push({
      id: "tail",
      parent: "root",
      order: 2,
      kind: "box",
      style: [
        { name: "background-color", value: style.card.background },
        { name: "clip-path", value: "polygon(0 0,100% 0,0 100%)" },
        { name: "height", value: px(style.card.tail.heightPx) },
        { name: "left", value: px(style.card.tail.offsetXPx) },
        { name: "position", value: "absolute" },
        { name: "top", value: px(cardHeight - 1) },
        { name: "width", value: px(style.card.tail.widthPx) },
      ],
    });
  }
  if (item.avatar !== undefined) {
    elements.push({
      id: "avatar",
      parent: "card",
      order: 3,
      kind: "image",
      artifact: structuredClone(item.avatar),
      style: [
        { name: "border", value: `${px(style.avatar.borderWidthPx)} solid ${style.avatar.borderColor}` },
        { name: "border-radius", value: "50%" },
        { name: "box-sizing", value: "border-box" },
        { name: "height", value: px(style.avatar.sizePx) },
        { name: "left", value: px(style.card.paddingXPx) },
        { name: "object-fit", value: "cover" },
        { name: "overflow", value: "hidden" },
        { name: "position", value: "absolute" },
        { name: "top", value: px(style.card.paddingYPx) },
        { name: "width", value: px(style.avatar.sizePx) },
      ],
    });
  } else if (showInitial) {
    elements.push({
      id: "avatar",
      parent: "card",
      order: 3,
      kind: "box",
      style: [
        { name: "align-items", value: "center" },
        { name: "background-color", value: style.avatar.background },
        { name: "border", value: `${px(style.avatar.borderWidthPx)} solid ${style.avatar.borderColor}` },
        { name: "border-radius", value: "50%" },
        { name: "box-sizing", value: "border-box" },
        { name: "display", value: "flex" },
        { name: "height", value: px(style.avatar.sizePx) },
        { name: "justify-content", value: "center" },
        { name: "left", value: px(style.card.paddingXPx) },
        { name: "position", value: "absolute" },
        { name: "top", value: px(style.card.paddingYPx) },
        { name: "width", value: px(style.avatar.sizePx) },
      ],
    }, textElement({
      id: "avatar-initial",
      parent: "avatar",
      order: 4,
      text: initial(content.author!),
      style: { ...style.header, sizePx: style.avatar.sizePx * 0.42, weight: 850, lineHeight: 1, color: style.avatar.textColor },
      x: 0,
      y: style.avatar.sizePx * 0.28,
      width: style.avatar.sizePx,
      height: style.avatar.sizePx * 0.5,
      align: "center",
    }));
  }
  elements.push(
    textElement({ id: "header", parent: "card", order: 5, text: displayHeader(content), style: style.header,
      x: contentX, y: headerY, width: contentWidth, height: headerHeight }),
    bodyElement({ parent: "card", text: content.comment, style: style.body,
      x: contentX, y: bodyY, width: contentWidth, height: bodyHeight }),
  );
  if (content.meta !== undefined) {
    elements.push(textElement({ id: "meta", parent: "card", order: 7, text: content.meta, style: style.meta,
      x: contentX, y: cardHeight - style.card.paddingYPx - metaHeight, width: contentWidth, height: metaHeight }));
  }
  return elements;
}

export function renderCommentSticker(canvas: CanvasSpace, space: ProgramSpace, program: CommentStickerProgram): VisualTrack {
  assertCanvasSpace(canvas);
  assertProgramSpaceIdentity(space);
  assertCommentStickerProgram(program);
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: program.id,
    presents: program.items.map((item) => ({
      id: item.id,
      span: { ...item.span },
      stacking: { order: item.style.stackingOrder, tieBreak: item.tieBreak },
      elements: stickerElements(item),
    })),
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
