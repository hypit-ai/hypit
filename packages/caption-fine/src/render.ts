import { assertCaptionProgramForDisplay, assertTimedCaptionProjection } from "@narratage/caption";
import type { CaptionProgram, TimedCaptionProjection } from "@narratage/caption";
import { assertVisualTrackIdentity, sealVisualTrack } from "@narratage/composition";
import type {
  VisualAnimation,
  VisualBoxElement,
  VisualElement,
  VisualKeyframe,
  VisualStyleDeclaration,
  VisualTextElement,
  VisualTrack,
} from "@narratage/composition";
import type { CaptionDisplayAtom, CaptionDisplaySequence } from "@narratage/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";

import { assertFineCaptionParameters, FINE_CAPTION_FAMILY } from "./style.js";
import type { FineCaptionGlyphPaint, FineCaptionParameters } from "./types.js";

export const renderFineCaptionImplementationDigest = digestOf("@narratage/caption-fine/render-atom-paint-karaoke@1");

function frameAt(space: ProgramSpace, seconds: number): number {
  return Math.round(seconds * space.frameRate.numerator / space.frameRate.denominator);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function compactNumber(value: number): string {
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

function alphaColor(hex: string, opacity: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const authoredAlpha = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return `rgba(${red},${green},${blue},${compactNumber(authoredAlpha * opacity)})`;
}

function glyphStyle(parameters: FineCaptionParameters, paint: FineCaptionGlyphPaint): VisualStyleDeclaration[] {
  const shadows: string[] = [];
  if (paint.shadow.opacity > 0) {
    shadows.push([
      `${compactNumber(paint.shadow.offsetXPx)}px`,
      `${compactNumber(paint.shadow.offsetYPx)}px`,
      `${compactNumber(paint.shadow.blurPx)}px`,
      alphaColor(paint.shadow.color, paint.shadow.opacity),
    ].join(" "));
  }
  if (paint.glow.opacity > 0) {
    shadows.push(`0 0 ${compactNumber(paint.glow.blurPx)}px ${alphaColor(paint.glow.color, paint.glow.opacity)}`);
  }
  return [
    { name: "color", value: paint.fill },
    { name: "font-family", value: parameters.typography.fontFamily },
    { name: "font-size", value: `${compactNumber(parameters.typography.fontSizePx)}px` },
    { name: "font-style", value: parameters.typography.fontStyle },
    { name: "font-weight", value: parameters.typography.fontWeight },
    { name: "letter-spacing", value: `${compactNumber(parameters.layout.letterSpacingPx)}px` },
    { name: "line-height", value: parameters.layout.lineHeight },
    { name: "opacity", value: paint.opacity },
    { name: "white-space", value: "nowrap" },
    ...(paint.stroke.widthPx === 0 ? [] : [
      { name: "-webkit-text-stroke-color", value: paint.stroke.color },
      { name: "-webkit-text-stroke-width", value: `${compactNumber(paint.stroke.widthPx)}px` },
    ] as const),
    ...(shadows.length === 0 ? [] : [{ name: "text-shadow", value: shadows.join(",") }] as const),
  ];
}

function styleIdentity(style: readonly VisualStyleDeclaration[]): string {
  return JSON.stringify(style);
}

function animationFrom(
  durationFrames: number,
  offsets: Iterable<number>,
  styleAt: (frame: number) => readonly VisualStyleDeclaration[],
): VisualAnimation | undefined {
  const keyframes = [...new Set([0, durationFrames, ...offsets])]
    .filter((frame) => Number.isSafeInteger(frame) && frame >= 0 && frame <= durationFrames)
    .sort((left, right) => left - right)
    .map((atFrame): VisualKeyframe => ({ atFrame, style: styleAt(atFrame) }));
  if (new Set(keyframes.map((keyframe) => styleIdentity(keyframe.style))).size === 1) return undefined;
  return { keyframes };
}

function stepOffsets(...boundaries: number[]): number[] {
  return boundaries.flatMap((boundary) => [boundary - 1, boundary]);
}

function cueAnimation(parameters: FineCaptionParameters, durationFrames: number): VisualAnimation | undefined {
  const requested = parameters.motion.cueTransitionFrames;
  const enterFrames = parameters.motion.cueEnter === "fade" ? Math.min(requested, Math.floor(durationFrames / 2)) : 0;
  const exitFrames = parameters.motion.cueExit === "fade" ? Math.min(requested, Math.floor(durationFrames / 2)) : 0;
  return animationFrom(durationFrames, [enterFrames, durationFrames - exitFrames], (frame) => {
    const enter = enterFrames === 0 ? 1 : clamp(frame / enterFrames, 0, 1);
    const exit = exitFrames === 0 ? 1 : clamp((durationFrames - frame) / exitFrames, 0, 1);
    return [{ name: "opacity", value: Math.min(enter, exit) }];
  });
}

function atomAnimation(
  parameters: FineCaptionParameters,
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation | undefined {
  if (parameters.motion.atomReveal === "all" && parameters.motion.activeScale === 1) return undefined;
  return animationFrom(durationFrames, stepOffsets(startFrame, endFrame), (frame) => {
    const active = frame >= startFrame && (frame < endFrame || (endFrame === durationFrames && frame === durationFrames));
    const revealed = parameters.motion.atomReveal === "all" || frame >= startFrame;
    return [
      { name: "opacity", value: revealed ? 1 : 0 },
      { name: "transform", value: `scale(${compactNumber(active ? parameters.motion.activeScale : 1)})` },
    ];
  });
}

function karaokeStepAnimation(
  parameters: FineCaptionParameters,
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation {
  return animationFrom(durationFrames, stepOffsets(startFrame, endFrame), (frame) => {
    const active = parameters.karaoke.mode === "trail"
      ? frame >= startFrame
      : frame >= startFrame && (frame < endFrame || (endFrame === durationFrames && frame === durationFrames));
    return [{ name: "opacity", value: active ? 1 : 0 }];
  }) ?? { keyframes: [
    { atFrame: 0, style: [{ name: "opacity", value: 1 }] },
    { atFrame: durationFrames, style: [{ name: "opacity", value: 1 }] },
  ] };
}

function wipeClip(progress: number, direction: FineCaptionParameters["layout"]["direction"]): string {
  const hidden = compactNumber((1 - clamp(progress, 0, 1)) * 100);
  return direction === "rtl" ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
}

function karaokeWipeAnimation(
  parameters: FineCaptionParameters,
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation {
  if (parameters.karaoke.mode === "current" && endFrame - startFrame <= 1) {
    return karaokeStepAnimation(parameters, startFrame, endFrame, durationFrames);
  }
  const revealEnd = parameters.karaoke.mode === "current" ? endFrame - 1 : endFrame;
  return animationFrom(durationFrames, [startFrame, revealEnd, endFrame], (frame) => {
    let progress = 0;
    if (frame >= startFrame && frame <= revealEnd) {
      progress = revealEnd === startFrame ? 1 : (frame - startFrame) / (revealEnd - startFrame);
    } else if (parameters.karaoke.mode === "trail" && frame > revealEnd) {
      progress = 1;
    }
    return [{ name: "clip-path", value: wipeClip(progress, parameters.layout.direction) }];
  }) ?? { keyframes: [
    { atFrame: 0, style: [{ name: "clip-path", value: wipeClip(1, parameters.layout.direction) }] },
    { atFrame: durationFrames, style: [{ name: "clip-path", value: wipeClip(1, parameters.layout.direction) }] },
  ] };
}

function anchorTransform(parameters: FineCaptionParameters): string | undefined {
  const x = parameters.placement.anchorX === "left" ? 0 : parameters.placement.anchorX === "center" ? -50 : -100;
  const y = parameters.placement.anchorY === "top" ? 0 : parameters.placement.anchorY === "center" ? -50 : -100;
  return x === 0 && y === 0 ? undefined : `translate(${x}%,${y}%)`;
}

function cueElements(
  atoms: readonly CaptionDisplayAtom[],
  atomFrames: ReadonlyMap<string, { readonly start: number; readonly end: number }>,
  parameters: FineCaptionParameters,
  wordText: ReadonlyMap<string, string>,
  durationFrames: number,
): VisualElement[] {
  type UnorderedVisualElement = Omit<VisualBoxElement, "order"> | Omit<VisualTextElement, "order">;
  const elements: VisualElement[] = [];
  let order = 0;
  const push = (element: UnorderedVisualElement): void => {
    elements.push({ ...element, order } as VisualElement);
    order += 1;
  };
  const transform = anchorTransform(parameters);
  const cueMotion = cueAnimation(parameters, durationFrames);
  push({
    id: "placement",
    kind: "box",
    style: [
      { name: "align-items", value: "center" },
      { name: "display", value: "flex" },
      { name: "justify-content", value: parameters.layout.textAlign === "left" ? "flex-start"
        : parameters.layout.textAlign === "right" ? "flex-end" : "center" },
      { name: "left", value: `${compactNumber(parameters.placement.x * 100)}%` },
      { name: "position", value: "absolute" },
      { name: "top", value: `${compactNumber(parameters.placement.y * 100)}%` },
      ...(transform === undefined ? [] : [{ name: "transform", value: transform }] as const),
      { name: "width", value: `${compactNumber(parameters.placement.width * 100)}%` },
    ],
  });
  push({
    id: "cue",
    parent: "placement",
    kind: "box",
    style: [
      { name: "background", value: parameters.cueBox.background },
      { name: "border-color", value: parameters.cueBox.borderColor },
      { name: "border-radius", value: `${compactNumber(parameters.cueBox.radiusPx)}px` },
      { name: "border-style", value: "solid" },
      { name: "border-width", value: `${compactNumber(parameters.cueBox.borderWidthPx)}px` },
      { name: "column-gap", value: `${compactNumber(parameters.layout.wordGapPx)}px` },
      { name: "direction", value: parameters.layout.direction },
      { name: "display", value: "flex" },
      { name: "flex-wrap", value: "wrap" },
      { name: "justify-content", value: parameters.layout.textAlign === "left" ? "flex-start"
        : parameters.layout.textAlign === "right" ? "flex-end" : "center" },
      { name: "padding", value: `${compactNumber(parameters.cueBox.paddingYPx)}px ${compactNumber(parameters.cueBox.paddingXPx)}px` },
      { name: "text-align", value: parameters.layout.textAlign },
    ],
    ...(cueMotion === undefined ? {} : { animation: cueMotion }),
  });

  for (const [atomIndex, atom] of atoms.entries()) {
    const timing = atomFrames.get(atom.id);
    if (timing === undefined) throw new Error(`Fine Caption is missing timing for Atom ${atom.id}`);
    const atomId = `atom-${atomIndex + 1}`;
    const animation = atomAnimation(parameters, timing.start, timing.end, durationFrames);
    push({
      id: atomId,
      parent: "cue",
      kind: "box",
      style: [
        { name: "column-gap", value: `${compactNumber(parameters.layout.wordGapPx)}px` },
        { name: "display", value: "inline-flex" },
        { name: "position", value: "relative" },
        { name: "transform-origin", value: "center center" },
        { name: "white-space", value: "nowrap" },
      ],
      ...(animation === undefined ? {} : { animation }),
      attributes: [{ name: "data-caption-atom", value: atom.id }],
    });
    for (const [wordIndex, wordId] of atom.wordIds.entries()) {
      const text = wordText.get(wordId);
      if (text === undefined) throw new Error(`Fine Caption Atom references unknown word ${wordId}`);
      push({
        id: `${atomId}-base-${wordIndex + 1}`,
        parent: atomId,
        kind: "text",
        text,
        style: glyphStyle(parameters, parameters.basePaint),
        attributes: [{ name: "data-caption-word", value: wordId }],
      });
    }
    if (parameters.karaoke.mode === "off") continue;
    const activeId = `${atomId}-active`;
    push({
      id: activeId,
      parent: atomId,
      kind: "box",
      style: [
        { name: "column-gap", value: `${compactNumber(parameters.layout.wordGapPx)}px` },
        { name: "display", value: "inline-flex" },
        { name: "inset", value: "0" },
        { name: "overflow", value: "hidden" },
        { name: "position", value: "absolute" },
      ],
      animation: parameters.karaoke.transition === "step"
        ? karaokeStepAnimation(parameters, timing.start, timing.end, durationFrames)
        : karaokeWipeAnimation(parameters, timing.start, timing.end, durationFrames),
      attributes: [{ name: "data-caption-karaoke", value: parameters.karaoke.mode }],
    });
    for (const [wordIndex, wordId] of atom.wordIds.entries()) {
      const text = wordText.get(wordId)!;
      push({
        id: `${atomId}-active-${wordIndex + 1}`,
        parent: activeId,
        kind: "text",
        text,
        style: glyphStyle(parameters, parameters.activePaint),
        attributes: [{ name: "data-caption-active-word", value: wordId }],
      });
    }
  }
  return elements;
}

export function renderFineCaption(
  projection: TimedCaptionProjection,
  program: CaptionProgram,
  display: CaptionDisplaySequence,
  space: ProgramSpace,
): VisualTrack {
  assertTimedCaptionProjection(projection);
  assertCaptionProgramForDisplay(program, display);
  if (projection.displaySequenceId !== display.id) throw new Error("Fine Caption received another display sequence");
  assertProgramSpaceIdentity(space);
  const styles = new Map(program.styles.map((style) => [style.id, style]));
  const wordText = new Map(display.words.map((word) => [word.id, word.text]));
  const atomById = new Map(display.atoms.map((atom) => [atom.id, atom]));
  for (const style of styles.values()) {
    if (style.rendering.family !== FINE_CAPTION_FAMILY) {
      throw new Error(`Fine Caption cannot render Style family ${style.rendering.family}`);
    }
    assertFineCaptionParameters(style.rendering.parameters as unknown as FineCaptionParameters);
  }
  const totalFrames = programSpaceFrameCount(space);
  const presents = projection.cues.flatMap((cue) => {
    const atoms = cue.atoms.map((timing) => atomById.get(timing.atomId));
    if (atoms.some((atom) => atom === undefined)) throw new Error(`Fine Caption Cue ${cue.id} references unknown Atom`);
    const resolvedAtoms = atoms.map((atom) => atom!);
    const style = styles.get(cue.styleId);
    if (style === undefined) throw new Error(`Fine Caption Cue ${cue.id} references unknown Style ${cue.styleId}`);
    const parameters = style.rendering.parameters as unknown as FineCaptionParameters;
    if (cue.fields.length > 0) throw new Error(`Fine Caption Cue ${cue.id} contains unsupported fields`);
    const startFrame = Math.max(0, frameAt(space, cue.startSec));
    const measuredEnd = Math.min(totalFrames, frameAt(space, cue.endSec));
    const endFrameExclusive = Math.min(totalFrames, Math.max(startFrame + 1, measuredEnd));
    if (startFrame >= totalFrames || endFrameExclusive <= startFrame) return [];
    const durationFrames = endFrameExclusive - startFrame;
    const atomFrames = new Map(cue.atoms.map((atom) => [atom.atomId, {
      start: clamp(frameAt(space, atom.startSec) - startFrame, 0, durationFrames),
      end: clamp(Math.max(frameAt(space, atom.endSec) - startFrame, frameAt(space, atom.startSec) - startFrame + 1), 0, durationFrames),
    }]));
    return [{
      id: cue.id,
      span: { startFrame, endFrameExclusive },
      stacking: { order: parameters.stackingOrder, tieBreak: `${program.id}:${cue.id}` },
      elements: cueElements(resolvedAtoms, atomFrames, parameters, wordText, durationFrames),
    }];
  });
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: program.id,
    presents,
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
