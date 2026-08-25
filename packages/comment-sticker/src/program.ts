import {
  assertVisualTrackIdentity,
  sealVisualTrack,
} from "@hypit/composition";
import type {
  VisualAnimation,
  VisualElement,
  VisualStyleDeclaration,
  VisualTextFlow,
  VisualTextTypography,
  VisualTrack,
} from "@hypit/composition";
import { assertFontArtifactRef } from "@hypit/media";
import { assertProgramSpaceIdentity } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize, isDigest } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import { assertCanvasSpace, assertSpatialFrame } from "@hypit/spatial";
import type { CanvasSpace, SpatialFrame } from "@hypit/spatial";
import { assertTemporalWindowFor } from "@hypit/temporal";
import type { ProjectedWindow } from "@hypit/temporal";
import { verifyText } from "@hypit/text";
import type { Text } from "@hypit/text";

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

function background(value: string, label: string): void {
  assert(
    /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value) || /^linear-gradient\(.+\)$/iu.test(value),
    `${label} must be a hexadecimal color or linear gradient.`,
  );
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
  background(value.avatar.background, "CommentStickerStyle.avatar.background");
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
  assert(["linear", "ease-in", "ease-out", "ease-in-out", "out-back"].includes(value.motion.enter.easing), "CommentStickerStyle enter easing is invalid.");
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
  assert(value.comment.trim().length > 0, "Comment Sticker comment cannot be blank.");
  optionalText(value.author, "Comment Sticker author");
  optionalText(value.header, "Comment Sticker header");
  optionalText(value.meta, "Comment Sticker meta");
}

export function createCommentStickerContent(comment: Text): CommentStickerContent {
  verifyText(comment);
  const value: CommentStickerContent = { comment: comment.value };
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
  identity(value.id, "CommentStickerHeader.id");
}

export function sealCommentStickerHeader(value: CommentStickerHeader): CommentStickerHeader {
  assertCommentStickerHeader(value);
  return canonicalize(value) as unknown as CommentStickerHeader;
}

export function assertCommentStickerItemSpec(value: CommentStickerItemSpec): void {
  identity(value.id, "CommentStickerItemSpec.id");
}

export function sealCommentStickerItemSpec(value: CommentStickerItemSpec): CommentStickerItemSpec {
  assertCommentStickerItemSpec(value);
  return canonicalize(value) as unknown as CommentStickerItemSpec;
}

export function createCommentStickerSet(): CommentStickerSet {
  return { items: [] };
}

export function assertCommentStickerSet(value: CommentStickerSet): void {
  assert(Array.isArray(value.items), "CommentStickerSet is invalid.");
}

function realized(
  set: CommentStickerSet,
  header: CommentStickerHeader,
  space: ProgramSpace,
  frame: SpatialFrame,
  style: CommentStickerStyle,
  spec: CommentStickerItemSpec,
  content: CommentStickerContent,
  window: ProjectedWindow,
  avatar?: BlobRef,
): CommentStickerSet {
  assertCommentStickerSet(set);
  assertCommentStickerHeader(header);
  assertSpatialFrame(frame);
  assertCommentStickerStyle(style);
  assertCommentStickerItemSpec(spec);
  assertCommentStickerContent(content);
  if (avatar !== undefined) assertAvatar(avatar);
  const addition: CommentStickerItemProgram = {
    id: window.id,
    subjectId: spec.id,
    span: { ...window.span },
    frame: structuredClone(frame),
    style: structuredClone(style),
    content: structuredClone(content),
    ...(avatar === undefined ? {} : { avatar: structuredClone(avatar) }),
    tieBreak: `${header.id}:${spec.id}`,
  };
  const ids = new Set(set.items.map((item) => item.id));
  assert(!ids.has(addition.id), `Comment Sticker already contains Item ${addition.id}.`);
  return { items: [...set.items, addition] };
}

/** Component entry point: timing is already a TemporalWindow. */
export function appendProjectedCommentSticker(
  set: CommentStickerSet,
  header: CommentStickerHeader,
  space: ProgramSpace,
  frame: SpatialFrame,
  style: CommentStickerStyle,
  spec: CommentStickerItemSpec,
  content: CommentStickerContent,
  window: ProjectedWindow,
  avatar?: BlobRef,
): CommentStickerSet {
  assertTemporalWindowFor(window, { subjectId: spec.id, space });
  return realized(set, header, space, frame, style, spec, content, window, avatar);
}

export function assertCommentStickerProgram(value: CommentStickerProgram): void {
  identity(value.id, "CommentStickerProgram.id");
  assert(value.items.length > 0, "CommentStickerProgram requires Items.");
  const ids = new Set<string>();
  for (const item of value.items) {
    identity(item.id, "CommentStickerItemProgram.id");
    identity(item.subjectId, "CommentStickerItemProgram.subjectId");
    assert(!ids.has(item.id), `Duplicate Comment Sticker Item ${item.id}.`);
    ids.add(item.id);
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
  return sealCommentStickerProgram({ id: header.id, items: set.items });
}

function px(value: number): string {
  return `${Number(value.toFixed(6))}px`;
}

function transform(y: number, rotation: number, scale: number): string {
  return `translate3d(0px,${px(y)},0) rotate(${Number(rotation.toFixed(6))}deg) scale(${Number(scale.toFixed(6))})`;
}

function motionProgress(value: number, easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "out-back"): number {
  const progress = Math.max(0, Math.min(1, value));
  if (easing === "linear") return progress;
  if (easing === "ease-in") return progress * progress * progress;
  if (easing === "ease-out") return 1 - Math.pow(1 - progress, 3);
  if (easing === "out-back") {
    const overshoot = 1.70158;
    return 1 + (overshoot + 1) * Math.pow(progress - 1, 3) + overshoot * Math.pow(progress - 1, 2);
  }
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function motionAnimation(style: CommentStickerStyle, duration: number): VisualAnimation | undefined {
  const enterDuration = style.motion.enter.kind === "none" ? 0 : style.motion.enter.durationFrames;
  const exitDuration = style.motion.exit.kind === "none" ? 0 : style.motion.exit.durationFrames;
  if (enterDuration === 0 && exitDuration === 0 && style.motion.hold.kind === "none") return undefined;
  const baseRotation = style.card.rotationDeg;
  const exitStart = duration - exitDuration;
  return {
    keyframes: Array.from({ length: duration + 1 }, (_, atFrame) => {
      const enter = style.motion.enter;
      const enterRawProgress = enterDuration === 0 ? 1 : Math.max(0, Math.min(1, atFrame / enterDuration));
      const enterProgress = motionProgress(enterRawProgress, enter.easing);
      const enterOpacity = enter.easing === "out-back" && enter.kind !== "fade"
        ? Math.min(1, enterRawProgress * 1.35)
        : Math.max(0, Math.min(1, enterProgress));
      const exit = style.motion.exit;
      const exitProgress = exitDuration === 0 ? 0 : motionProgress((atFrame - exitStart) / exitDuration, exit.easing);
      const holdActive = style.motion.hold.kind === "float" && atFrame >= enterDuration && atFrame <= exitStart;
      const holdPhase = holdActive ? (atFrame - enterDuration) / style.motion.hold.periodFrames * Math.PI * 2 : 0;
      const holdY = holdActive ? Math.sin(holdPhase) * style.motion.hold.amplitudeYPx : 0;
      const holdRotation = holdActive ? Math.sin(holdPhase) * style.motion.hold.rotationAmplitudeDeg : 0;
      const enterY = enter.kind === "slide-pop" ? enter.offsetYPx * (1 - enterProgress) : 0;
      const enterRotation = enter.kind === "fade" || enter.kind === "none" ? 0 : enter.rotationDeltaDeg * (1 - enterProgress);
      const enterScale = enter.kind === "fade" || enter.kind === "none" ? 1 : enter.startScale + ((1 - enter.startScale) * enterProgress);
      const exitY = exit.kind === "fade-up" ? exit.offsetYPx * exitProgress : 0;
      return {
        atFrame,
        easing: "linear" as const,
        style: [
          { name: "opacity", value: enterOpacity * (1 - exitProgress) },
          { name: "transform", value: transform(enterY + holdY + exitY, baseRotation + enterRotation + holdRotation, enterScale) },
        ],
      };
    }),
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
  const bodyTypography = typography(input.style);
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
    typography: { ...bodyTypography, trackingPx: input.style.sizePx * -0.02 },
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
        { name: "background", value: style.avatar.background },
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
    programSpaceId: space.id,
    visualIr: "hypit.visual-ir@1",
    id: program.id,
    presents: program.items.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      span: { ...item.span },
      stacking: { order: item.style.stackingOrder, tieBreak: item.tieBreak },
      elements: stickerElements(item),
    })),
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
