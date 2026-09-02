import { assertVisualTrackIdentity, sealVisualTrack } from "@hypit/composition";
import type { VisualAnimation, VisualElement, VisualTrack } from "@hypit/composition";
import { assertProgramSpaceIdentity } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import { assertCanvasSpace } from "@hypit/spatial";
import type { CanvasSpace } from "@hypit/spatial";
import { assertTemporalInstantFor, assertTemporalWindowFor } from "@hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";

import type { EmojiRevealHeader, EmojiRevealItemSpec, EmojiRevealProgram, EmojiRevealSet, EmojiRevealStyle } from "./types.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function identity(value: string, label: string): void { assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`); }
function finite(value: number, label: string): void { assert(Number.isFinite(value), `${label} is invalid.`); }
function nonNegative(value: number, label: string): void { finite(value, label); assert(value >= 0, `${label} must be non-negative.`); }
function positive(value: number, label: string): void { finite(value, label); assert(value > 0, `${label} must be positive.`); }
function ratio(value: number, label: string): void { finite(value, label); assert(value >= 0 && value <= 1, `${label} must be between 0 and 1.`); }
function color(value: string, label: string): void { assert(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} must be a hexadecimal color.`); }

export function sealEmojiRevealHeader(value: EmojiRevealHeader): EmojiRevealHeader {
  assertEmojiRevealHeader(value); return canonicalize(value) as unknown as EmojiRevealHeader;
}
export function assertEmojiRevealHeader(value: EmojiRevealHeader): void { identity(value.id, "EmojiRevealHeader.id"); }

export function sealEmojiRevealItemSpec(value: EmojiRevealItemSpec): EmojiRevealItemSpec {
  assertEmojiRevealItemSpec(value); return canonicalize(value) as unknown as EmojiRevealItemSpec;
}
export function assertEmojiRevealItemSpec(value: EmojiRevealItemSpec): void {
  identity(value.id, "EmojiRevealItemSpec.id");
}

function assertIconImage(value: BlobRef, label: string): void {
  assert(value.kind === "blob" && value.mediaType.startsWith("image/") && Number.isSafeInteger(value.size) && value.size > 0,
    `${label} must be an Image Artifact.`);
}

export function assertEmojiRevealStyle(value: EmojiRevealStyle): void {
  identity(value.id, "EmojiRevealStyle.id");
  ratio(value.centerX, "EmojiRevealStyle.centerX"); ratio(value.topY, "EmojiRevealStyle.topY");
  positive(value.slotSizePx, "EmojiRevealStyle.slotSizePx"); nonNegative(value.gapPx, "EmojiRevealStyle.gapPx");
  nonNegative(value.paddingXPx, "EmojiRevealStyle.paddingXPx"); nonNegative(value.paddingYPx, "EmojiRevealStyle.paddingYPx");
  color(value.background, "EmojiRevealStyle.background"); color(value.borderColor, "EmojiRevealStyle.borderColor");
  nonNegative(value.borderWidthPx, "EmojiRevealStyle.borderWidthPx"); nonNegative(value.radiusPx, "EmojiRevealStyle.radiusPx");
  color(value.shadowColor, "EmojiRevealStyle.shadowColor"); finite(value.shadowXPx, "EmojiRevealStyle.shadowXPx");
  finite(value.shadowYPx, "EmojiRevealStyle.shadowYPx"); nonNegative(value.shadowBlurPx, "EmojiRevealStyle.shadowBlurPx");
  finite(value.shadowSpreadPx, "EmojiRevealStyle.shadowSpreadPx"); positive(value.iconSizePx, "EmojiRevealStyle.iconSizePx");
  assert(value.iconSizePx <= value.slotSizePx, "EmojiRevealStyle.iconSizePx cannot exceed its slot.");
  assert(Number.isSafeInteger(value.revealFrames) && value.revealFrames > 0, "EmojiRevealStyle.revealFrames must be a positive integer.");
  assert(Number.isSafeInteger(value.stackingOrder), "EmojiRevealStyle.stackingOrder must be an integer.");
}

export function createEmojiRevealSet(): EmojiRevealSet { return { items: [] }; }
export function assertEmojiRevealSet(value: EmojiRevealSet): void {
  assert(Array.isArray(value.items), "EmojiRevealSet is invalid.");
  const ids = new Set<string>();
  for (const item of value.items) {
    assertEmojiRevealItemSpec(item.spec); assertIconImage(item.icon, `Emoji Reveal Item ${item.spec.id} icon`); identity(item.activation.id, "Emoji Reveal activation id");
    assert(!ids.has(item.spec.id), `Duplicate Emoji Reveal Item ${item.spec.id}.`); ids.add(item.spec.id);
  }
}

export function appendEmojiRevealItem(set: EmojiRevealSet, space: ProgramSpace, spec: EmojiRevealItemSpec, icon: BlobRef, activation: TemporalInstant): EmojiRevealSet {
  assertEmojiRevealSet(set); assertProgramSpaceIdentity(space); assertEmojiRevealItemSpec(spec);
  assertIconImage(icon, `Emoji Reveal Item ${spec.id} icon`);
  assertTemporalInstantFor(activation, { subjectId: spec.id, space });
  assert(!set.items.some((item) => item.spec.id === spec.id), `Duplicate Emoji Reveal Item ${spec.id}.`);
  return { items: [...set.items, { spec: structuredClone(spec), icon: structuredClone(icon), activation: structuredClone(activation) }] };
}

export function finalizeEmojiReveal(
  header: EmojiRevealHeader, space: ProgramSpace, outer: TemporalWindow, style: EmojiRevealStyle, placeholder: BlobRef, set: EmojiRevealSet,
): EmojiRevealProgram {
  assertEmojiRevealHeader(header); assertProgramSpaceIdentity(space); assertEmojiRevealStyle(style); assertEmojiRevealSet(set);
  assertIconImage(placeholder, "Emoji Reveal placeholder");
  assertTemporalWindowFor(outer, { subjectId: header.id, space });
  assert(set.items.length > 0, "Emoji Reveal requires at least one Item.");
  let previous = outer.span.startFrame - 1;
  for (const item of set.items) {
    const frame = item.activation.frame;
    assert(frame >= outer.span.startFrame && frame < outer.span.endFrameExclusive,
      `Emoji Reveal Item ${item.spec.id} must activate inside the Track Window.`);
    assert(frame > previous, `Emoji Reveal Item ${item.spec.id} must activate after the previous Item.`);
    previous = frame;
  }
  const program: EmojiRevealProgram = {
    id: header.id, programSpaceId: space.id, outer: structuredClone(outer), style: structuredClone(style),
    placeholder: structuredClone(placeholder), items: structuredClone(set.items),
  };
  assertEmojiRevealProgram(program);
  return canonicalize(program) as unknown as EmojiRevealProgram;
}

export function assertEmojiRevealProgram(value: EmojiRevealProgram): void {
  identity(value.id, "EmojiRevealProgram.id"); identity(value.programSpaceId, "EmojiRevealProgram.programSpaceId");
  assertEmojiRevealStyle(value.style); assertEmojiRevealSet({ items: value.items });
  assertIconImage(value.placeholder, "EmojiRevealProgram.placeholder");
  assert(value.items.length > 0, "EmojiRevealProgram requires Items.");
  assert(value.outer.span.endFrameExclusive > value.outer.span.startFrame, "EmojiRevealProgram outer Window is empty.");
  let previous = value.outer.span.startFrame - 1;
  for (const item of value.items) {
    assert(item.activation.frame >= value.outer.span.startFrame && item.activation.frame < value.outer.span.endFrameExclusive,
      `Emoji Reveal Item ${item.spec.id} is outside the outer Window.`);
    assert(item.activation.frame > previous, `Emoji Reveal Item ${item.spec.id} is not in strict reveal order.`);
    previous = item.activation.frame;
  }
}

function px(value: number): string { return `${Number(value.toFixed(6))}px`; }
function scale(value: number): string { return `scale(${Number(value.toFixed(6))})`; }

function revealAnimation(atFrame: number, duration: number, revealFrames: number): VisualAnimation {
  const marks = new Map<number, { opacity: number; scale: number }>();
  marks.set(0, { opacity: atFrame === 0 ? 1 : 0, scale: 0.72 });
  if (atFrame > 0) marks.set(atFrame - 1, { opacity: 0, scale: 0.72 });
  marks.set(atFrame, { opacity: 1, scale: 0.72 });
  marks.set(Math.min(duration, atFrame + Math.max(1, Math.round(revealFrames * 0.34))), { opacity: 1, scale: 1.14 });
  marks.set(Math.min(duration, atFrame + Math.max(2, Math.round(revealFrames * 0.68))), { opacity: 1, scale: 0.95 });
  marks.set(Math.min(duration, atFrame + revealFrames), { opacity: 1, scale: 1 });
  marks.set(duration, { opacity: 1, scale: 1 });
  return { keyframes: [...marks].sort(([left], [right]) => left - right).map(([frame, value]) => ({
    atFrame: frame, easing: "linear", style: [{ name: "opacity", value: value.opacity }, { name: "transform", value: scale(value.scale) }],
  })) };
}

function questionAnimation(atFrame: number, duration: number): VisualAnimation {
  const marks = new Map<number, { opacity: number; scale: number }>();
  marks.set(0, { opacity: atFrame === 0 ? 0 : 1, scale: 1 });
  if (atFrame > 0) marks.set(atFrame - 1, { opacity: 1, scale: 1 });
  marks.set(atFrame, { opacity: 0, scale: 0.72 }); marks.set(duration, { opacity: 0, scale: 0.72 });
  return { keyframes: [...marks].sort(([left], [right]) => left - right).map(([frame, value]) => ({
    atFrame: frame, easing: "linear", style: [{ name: "opacity", value: value.opacity }, { name: "transform", value: scale(value.scale) }],
  })) };
}

function iconElement(input: {
  readonly id: string; readonly parent: string; readonly order: number; readonly artifact: BlobRef;
  readonly x: number; readonly y: number; readonly size: number; readonly animation: VisualAnimation;
}): VisualElement {
  return {
    id: input.id, parent: input.parent, order: input.order, kind: "image", artifact: structuredClone(input.artifact), animation: input.animation,
    style: [
      { name: "height", value: px(input.size) }, { name: "left", value: px(input.x) }, { name: "object-fit", value: "contain" },
      { name: "overflow", value: "visible" }, { name: "position", value: "absolute" }, { name: "top", value: px(input.y) },
      { name: "transform-origin", value: "center center" }, { name: "width", value: px(input.size) },
    ],
  };
}

export function renderEmojiReveal(canvas: CanvasSpace, space: ProgramSpace, program: EmojiRevealProgram): VisualTrack {
  assertCanvasSpace(canvas); assertProgramSpaceIdentity(space); assertEmojiRevealProgram(program);
  assert(program.programSpaceId === space.id, "EmojiRevealProgram belongs to another ProgramSpace.");
  assertTemporalWindowFor(program.outer, { subjectId: program.id, space });
  const { style } = program;
  const count = program.items.length;
  const width = style.paddingXPx * 2 + style.slotSizePx * count + style.gapPx * (count - 1);
  const height = style.paddingYPx * 2 + style.slotSizePx;
  const left = canvas.widthPx * style.centerX - width / 2;
  const top = canvas.heightPx * style.topY;
  assert(left - Math.max(0, -style.shadowXPx) >= 0 && left + width + Math.max(0, style.shadowXPx) <= canvas.widthPx,
    "Emoji Reveal strip is wider than the Canvas at this placement.");
  assert(top >= 0 && top + height + Math.max(0, style.shadowYPx) <= canvas.heightPx,
    "Emoji Reveal strip is outside the Canvas at this placement.");
  const duration = program.outer.span.endFrameExclusive - program.outer.span.startFrame;
  const elements: VisualElement[] = [{
    id: "root", order: 0, kind: "box", style: [
      { name: "height", value: px(height) }, { name: "left", value: px(left) }, { name: "overflow", value: "visible" },
      { name: "position", value: "absolute" }, { name: "top", value: px(top) }, { name: "width", value: px(width) },
    ],
  }, {
    id: "board", parent: "root", order: 1, kind: "box", style: [
      { name: "background-color", value: style.background },
      { name: "border", value: `${px(style.borderWidthPx)} solid ${style.borderColor}` },
      { name: "border-radius", value: px(style.radiusPx) },
      { name: "box-shadow", value: `${px(style.shadowXPx)} ${px(style.shadowYPx)} ${px(style.shadowBlurPx)} ${px(style.shadowSpreadPx)} ${style.shadowColor}` },
      { name: "box-sizing", value: "border-box" }, { name: "height", value: "100%" }, { name: "inset", value: "0" },
      { name: "overflow", value: "visible" }, { name: "position", value: "absolute" }, { name: "width", value: "100%" },
    ],
  }];
  program.items.forEach((item, index) => {
    const x = style.paddingXPx + index * (style.slotSizePx + style.gapPx);
    const atFrame = item.activation.frame - program.outer.span.startFrame;
    const parentId = `slot-${index + 1}`;
    elements.push({
      id: parentId, parent: "root", order: 2 + index * 3, kind: "box", style: [
        { name: "height", value: px(style.slotSizePx) }, { name: "left", value: px(x) }, { name: "overflow", value: "visible" },
        { name: "position", value: "absolute" }, { name: "top", value: px(style.paddingYPx) }, { name: "width", value: px(style.slotSizePx) },
      ],
    });
    elements.push(
      iconElement({ id: `${parentId}-placeholder`, parent: parentId, order: 3 + index * 3, artifact: program.placeholder,
        x: (style.slotSizePx - style.iconSizePx) / 2, y: (style.slotSizePx - style.iconSizePx) / 2,
        size: style.iconSizePx, animation: questionAnimation(atFrame, duration) }),
      iconElement({ id: `${parentId}-icon`, parent: parentId, order: 4 + index * 3, artifact: item.icon,
        x: (style.slotSizePx - style.iconSizePx) / 2, y: (style.slotSizePx - style.iconSizePx) / 2,
        size: style.iconSizePx, animation: revealAnimation(atFrame, duration, style.revealFrames) }),
    );
  });
  const track = sealVisualTrack({
    programSpaceId: space.id, visualIr: "hypit.visual-ir@1", id: program.id,
    presents: [{ id: program.id, subjectId: program.id, span: { ...program.outer.span },
      stacking: { order: style.stackingOrder, tieBreak: program.id }, elements }],
  });
  assertVisualTrackIdentity(track, space); return track;
}
