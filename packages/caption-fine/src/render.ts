import { assertCaptionProgramForDocument } from "@hypit/caption";
import type { CaptionProgram } from "@hypit/caption";
import { assertVisualTrackIdentity, sealVisualTrack } from "@hypit/composition";
import type {
  VisualAnimation,
  VisualBoxElement,
  VisualColorPaint,
  VisualElement,
  VisualKeyframe,
  VisualStyleDeclaration,
  VisualTextElement,
  VisualTextPaintLayer,
  VisualTrack,
} from "@hypit/composition";
import type { CaptionAlignmentUnit, CaptionDocument } from "@hypit/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";

import { assertFineCaptionParameters, FINE_CAPTION_FAMILY } from "./style.js";
import { assertFineCaptionSchedule } from "./schedule.js";
import type {
  FineCaptionActiveUnderline,
  FineCaptionGlyphPaint,
  FineCaptionOneShotMotion,
  FineCaptionParameters,
  FineCaptionSchedule,
  FineCaptionUnderline,
} from "./types.js";

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

function typographyStyle(parameters: FineCaptionParameters): VisualStyleDeclaration[] {
  return [
    { name: "font-size", value: `${compactNumber(parameters.typography.fontSizePx)}px` },
    { name: "font-kerning", value: parameters.typography.kerning },
    { name: "font-variant-caps", value: parameters.typography.variantCaps },
    { name: "letter-spacing", value: `${compactNumber(parameters.layout.letterSpacingPx)}px` },
    { name: "line-height", value: parameters.layout.lineHeight },
    { name: "text-transform", value: parameters.typography.textTransform },
  ];
}

function underlineStyle(underline: FineCaptionUnderline | FineCaptionActiveUnderline): VisualStyleDeclaration[] {
  if (underline.mode === "off") return [];
  return [
    { name: "text-decoration", value: "underline" },
    { name: "text-decoration-color", value: underline.color },
    { name: "text-decoration-thickness", value: `${compactNumber(underline.thicknessPx)}px` },
    { name: "text-underline-offset", value: `${compactNumber(underline.offsetPx)}px` },
  ];
}

/**
 * The glyph body and its outline, as ordered Paint.
 *
 * An outline belongs outside the letter. `-webkit-text-stroke` cannot put it there: it centres the
 * stroke on the glyph edge, so half the width is always inside, and the only choice left is which
 * half gets painted over. Declaring the Paint hands the placement to the renderer, which builds the
 * ring by dilating the glyph and subtracting it from itself — wholly outside, at the width asked
 * for rather than half of it.
 *
 * A caption with no outline keeps its plain fill, which is one element and one paint rather than
 * two, and is what most captions are.
 */
/**
 * CSS blur is a radius; a Gaussian blur is a deviation. The radius covers about two deviations, so
 * the same number means twice the cloud when it moves from one to the other. Authors tuned these
 * against the radius, and the outline is what moved, not the shadow.
 */
function deviationFromBlurRadius(radiusPx: number): number {
  return radiusPx / 2;
}

/**
 * The soft effects, ordered from the back forward.
 *
 * `text-shadow` paints its list front to back — the first shadow named is the one on top — while
 * Paint layers are drawn in the order they are declared. So this reverses: the far end of a long
 * shadow first, then the glow, then the drop shadow nearest the letter.
 */
function softPaints(paint: FineCaptionGlyphPaint): VisualTextPaintLayer[] {
  const layers: VisualTextPaintLayer[] = [];
  if (paint.longShadow.opacity > 0 && paint.longShadow.distancePx > 0) {
    const steps = Math.min(32, Math.max(1, Math.ceil(paint.longShadow.distancePx)));
    const radians = paint.longShadow.angleDeg * Math.PI / 180;
    for (let step = steps; step >= 1; step -= 1) {
      const distance = paint.longShadow.distancePx * step / steps;
      layers.push({
        kind: "shadow",
        paint: { kind: "solid", color: alphaColor(paint.longShadow.color, paint.longShadow.opacity) },
        offsetX: Math.cos(radians) * distance,
        offsetY: Math.sin(radians) * distance,
        blurPx: 0,
        spreadPx: 0,
      });
    }
  }
  if (paint.glow.opacity > 0) {
    layers.push({
      kind: "glow",
      paint: { kind: "solid", color: alphaColor(paint.glow.color, paint.glow.opacity) },
      blurPx: deviationFromBlurRadius(paint.glow.blurPx),
      spreadPx: paint.glow.spreadPx,
    });
  }
  if (paint.shadow.opacity > 0) {
    layers.push({
      kind: "shadow",
      paint: { kind: "solid", color: alphaColor(paint.shadow.color, paint.shadow.opacity) },
      offsetX: paint.shadow.offsetXPx,
      offsetY: paint.shadow.offsetYPx,
      blurPx: deviationFromBlurRadius(paint.shadow.blurPx),
      spreadPx: paint.shadow.spreadPx,
    });
  }
  return layers;
}

function glyphPaints(paint: FineCaptionGlyphPaint): VisualTextPaintLayer[] | undefined {
  if (paint.stroke.widthPx === 0 && paint.shadow.spreadPx === 0 && paint.glow.spreadPx === 0) return undefined;
  const fill: VisualColorPaint = paint.gradient === undefined
    ? { kind: "solid", color: paint.fill }
    : {
        kind: "linear-gradient",
        angleDeg: paint.gradient.angleDeg,
        stops: [
          { offset: 0, color: paint.gradient.from, opacity: 1 },
          { offset: 1, color: paint.gradient.to, opacity: 1 },
        ],
      };
  // Back to front: the soft effects fall behind the outline they are cast from, the outline sits
  // outside the letter, and the body sits over its own outline.
  return [
    ...softPaints(paint),
    ...(paint.stroke.widthPx === 0 ? [] : [{
      kind: "stroke" as const,
      placement: "outside" as const,
      widthPx: paint.stroke.widthPx,
      paint: { kind: "solid" as const, color: paint.stroke.color },
    }]),
    { kind: "fill", paint: fill },
  ];
}

/** The Paint fields of a text element, absent rather than empty when there is no outline. */
function glyphPaintFields(paint: FineCaptionGlyphPaint): { paints?: readonly VisualTextPaintLayer[] } {
  const paints = glyphPaints(paint);
  return paints === undefined ? {} : { paints };
}

function glyphStyle(
  parameters: FineCaptionParameters,
  paint: FineCaptionGlyphPaint,
  underline?: FineCaptionUnderline,
): VisualStyleDeclaration[] {
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
  if (paint.longShadow.opacity > 0 && paint.longShadow.distancePx > 0) {
    const steps = Math.min(32, Math.max(1, Math.ceil(paint.longShadow.distancePx)));
    const radians = paint.longShadow.angleDeg * Math.PI / 180;
    for (let step = 1; step <= steps; step += 1) {
      const distance = paint.longShadow.distancePx * step / steps;
      shadows.push([
        `${compactNumber(Math.cos(radians) * distance)}px`,
        `${compactNumber(Math.sin(radians) * distance)}px`,
        "0",
        alphaColor(paint.longShadow.color, paint.longShadow.opacity),
      ].join(" "));
    }
  }
  // An outlined caption carries its body and outline as Paint instead, so the fill is spelled once
  // — there, not here — and the two cannot disagree.
  const painted = glyphPaints(paint) !== undefined;
  return [
    ...(painted ? [] : [{ name: "color", value: paint.fill }] as const),
    ...typographyStyle(parameters),
    { name: "min-width", value: "0" },
    { name: "opacity", value: paint.opacity },
    { name: "white-space", value: "normal" },
    ...(painted || paint.gradient === undefined ? [] : [
      { name: "background-image", value: `linear-gradient(${compactNumber(paint.gradient.angleDeg)}deg,${paint.gradient.from},${paint.gradient.to})` },
      { name: "background-clip", value: "text" },
      { name: "-webkit-background-clip", value: "text" },
      { name: "-webkit-text-fill-color", value: "transparent" },
    ] as const),
    // An outlined caption casts its shadows as Paint, behind the outline. Left here as well they
    // would be cast by the body alone, and so land on top of the ring they are supposed to be under.
    ...(painted || shadows.length === 0 ? [] : [{ name: "text-shadow", value: shadows.join(",") }] as const),
    ...(underline === undefined ? [] : underlineStyle(underline)),
  ];
}

function transparentGlyphStyle(
  parameters: FineCaptionParameters,
  underline?: FineCaptionUnderline | FineCaptionActiveUnderline,
): VisualStyleDeclaration[] {
  return [
    { name: "color", value: "#00000000" },
    ...typographyStyle(parameters),
    { name: "min-width", value: "0" },
    { name: "white-space", value: "normal" },
    ...(underline === undefined ? [] : underlineStyle(underline)),
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

type MotionSnapshot = {
  readonly opacity: number;
  readonly transform: string;
  readonly filter: string;
  readonly clipPath: string;
};

function easeOut(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function easeOutBack(value: number): number {
  const c1 = 1.3;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function easeOutBounce(value: number): number {
  let x = value;
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

function easeOutElastic(value: number): number {
  if (value === 0 || value === 1) return value;
  return Math.pow(2, -10 * value) * Math.sin((value * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
}

const neutralMotion: MotionSnapshot = { opacity: 1, transform: "none", filter: "none", clipPath: "inset(0% 0% 0% 0%)" };

function motionSnapshot(kind: FineCaptionOneShotMotion, progress: number, distancePx: number): MotionSnapshot {
  const value = clamp(progress, 0, 1);
  const eased = easeOut(value);
  const state = (opacity: number, transform = "none", filter = "none", clipPath = neutralMotion.clipPath): MotionSnapshot =>
    ({ opacity, transform, filter, clipPath });
  if (kind === "none") return neutralMotion;
  if (kind === "fade") return state(eased);
  if (kind === "blur-in") return state(eased, `scale(${compactNumber(0.96 + 0.04 * eased)})`, `blur(${compactNumber((1 - eased) * 16)}px)`);
  if (kind === "pop") return state(eased, `scale(${compactNumber(0.6 + 0.4 * easeOutBack(value))})`);
  if (kind === "scale") return state(eased, `scale(${compactNumber(0.2 + 0.8 * eased)})`);
  if (kind === "spring") {
    const settled = value >= 1 ? 1 : 1 - Math.exp(-5 * value) * Math.cos(10 * value);
    return state(eased, `scale(${compactNumber(0.72 + 0.28 * settled)})`);
  }
  if (kind === "bounce") return state(eased, `scale(${compactNumber(easeOutBounce(value))})`);
  if (kind === "elastic") return state(eased, `scale(${compactNumber(easeOutElastic(value))})`);
  if (kind === "stamp") return state(eased, `scale(${compactNumber(1.35 - 0.35 * easeOutBack(value))})`);
  if (kind === "tilt") return state(eased, `rotate(${compactNumber((1 - eased) * -8)}deg) scale(${compactNumber(0.94 + 0.06 * eased)})`);
  if (kind === "zoom-blur") return state(eased, `scale(${compactNumber(1.18 - 0.18 * eased)})`, `blur(${compactNumber((1 - eased) * 18)}px)`);
  if (kind === "flip-x") return state(eased, `perspective(600px) rotateX(${compactNumber((1 - eased) * 88)}deg) scale(${compactNumber(0.92 + 0.08 * eased)})`);
  if (kind === "flip-y") return state(eased, `perspective(600px) rotateY(${compactNumber((1 - eased) * -88)}deg) scale(${compactNumber(0.92 + 0.08 * eased)})`);
  if (kind === "spin") return state(eased, `rotate(${compactNumber((1 - eased) * -180)}deg) scale(${compactNumber(0.55 + 0.45 * eased)})`);
  if (kind === "squash") return state(eased, `scaleX(${compactNumber(1.28 - 0.28 * easeOutBack(value))}) scaleY(${compactNumber(0.48 + 0.52 * easeOutBack(value))})`);
  if (kind === "stretch") return state(eased, `scaleX(${compactNumber(0.5 + 0.5 * easeOutBack(value))}) scaleY(${compactNumber(1.35 - 0.35 * easeOutBack(value))})`);
  const hidden = compactNumber((1 - eased) * 100);
  if (kind === "wipe-left") return state(1, "none", "none", `inset(0% 0% 0% ${hidden}%)`);
  if (kind === "wipe-right") return state(1, "none", "none", `inset(0% ${hidden}% 0% 0%)`);
  if (kind === "wipe-up") return state(1, "none", "none", `inset(0% 0% ${hidden}% 0%)`);
  if (kind === "wipe-down") return state(1, "none", "none", `inset(${hidden}% 0% 0% 0%)`);
  const remaining = compactNumber((1 - value) * distancePx);
  const transform = kind === "slide-left" ? `translateX(-${remaining}px)`
    : kind === "slide-right" ? `translateX(${remaining}px)`
      : kind === "slide-up" ? `translateY(-${remaining}px)`
        : `translateY(${remaining}px)`;
  return state(eased, transform);
}

function snapshotStyle(snapshot: MotionSnapshot): VisualStyleDeclaration[] {
  return [
    { name: "opacity", value: snapshot.opacity },
    { name: "transform", value: snapshot.transform },
    { name: "filter", value: snapshot.filter },
    { name: "clip-path", value: snapshot.clipPath },
  ];
}

function transitionOffsets(start: number, frames: number, kind: FineCaptionOneShotMotion): number[] {
  if (frames === 0) return stepOffsets(start);
  const samples = ["spring", "bounce", "elastic"].includes(kind) ? Math.min(frames, 12) : Math.min(frames, 4);
  return Array.from({ length: samples + 1 }, (_, index) => start + Math.round(frames * index / samples));
}

function cueAnimation(parameters: FineCaptionParameters, durationFrames: number): VisualAnimation | undefined {
  const enterFrames = parameters.motion.cueEnter === "none"
    ? 0 : Math.min(parameters.motion.cueEnterFrames, Math.floor(durationFrames / 2));
  const exitFrames = parameters.motion.cueExit === "none"
    ? 0 : Math.min(parameters.motion.cueExitFrames, Math.floor(durationFrames / 2));
  const offsets = [
    ...transitionOffsets(0, enterFrames, parameters.motion.cueEnter),
    ...transitionOffsets(durationFrames - exitFrames, exitFrames, parameters.motion.cueExit),
  ];
  return animationFrom(durationFrames, offsets, (frame) => {
    const enterProgress = enterFrames === 0 ? 1 : clamp(frame / enterFrames, 0, 1);
    const exitProgress = exitFrames === 0 ? 1 : clamp((durationFrames - frame) / exitFrames, 0, 1);
    const enter = motionSnapshot(parameters.motion.cueEnter, enterProgress, parameters.motion.slideDistancePx);
    const exit = motionSnapshot(parameters.motion.cueExit, exitProgress, parameters.motion.slideDistancePx);
    return snapshotStyle(enterProgress < 1 ? enter : exit);
  });
}

function atomLifecycleAnimation(
  parameters: FineCaptionParameters,
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation | undefined {
  const shouldWait = parameters.motion.atomReveal === "on-start" || parameters.motion.atomEnter !== "none";
  if (!shouldWait && parameters.motion.atomExit === "none") return undefined;
  const enterFrames = parameters.motion.atomEnter === "none" ? 0
    : Math.min(parameters.motion.atomEnterFrames, Math.max(0, endFrame - startFrame));
  const exitFrames = parameters.motion.atomExit === "none" ? 0
    : Math.min(parameters.motion.atomExitFrames, Math.max(0, endFrame - startFrame - enterFrames));
  const offsets = [
    ...transitionOffsets(startFrame, enterFrames, parameters.motion.atomEnter),
    ...transitionOffsets(endFrame - exitFrames, exitFrames, parameters.motion.atomExit),
    ...stepOffsets(endFrame),
  ];
  return animationFrom(durationFrames, offsets, (frame) => {
    if (frame < startFrame) return shouldWait ? [{ name: "opacity", value: 0 }] : snapshotStyle(neutralMotion);
    if (frame >= endFrame && parameters.motion.atomExit !== "none") {
      return snapshotStyle(motionSnapshot(parameters.motion.atomExit, 0, parameters.motion.slideDistancePx));
    }
    const enterProgress = enterFrames === 0 ? 1 : clamp((frame - startFrame) / enterFrames, 0, 1);
    const exitProgress = exitFrames === 0 ? 1 : clamp((endFrame - frame) / exitFrames, 0, 1);
    if (enterProgress < 1) return snapshotStyle(motionSnapshot(parameters.motion.atomEnter, enterProgress, parameters.motion.slideDistancePx));
    return snapshotStyle(motionSnapshot(parameters.motion.atomExit, exitProgress, parameters.motion.slideDistancePx));
  });
}

function activationStepAnimation(
  mode: "current" | "trail",
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation {
  return animationFrom(durationFrames, stepOffsets(startFrame, endFrame), (frame) => {
    const active = mode === "trail"
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
  mode: "current" | "trail",
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation {
  if (mode === "current" && endFrame - startFrame <= 1) {
    return activationStepAnimation(mode, startFrame, endFrame, durationFrames);
  }
  const revealEnd = mode === "current" ? endFrame - 1 : endFrame;
  return animationFrom(durationFrames, [startFrame, revealEnd, endFrame], (frame) => {
    let progress = 0;
    if (frame >= startFrame && frame <= revealEnd) {
      progress = revealEnd === startFrame ? 1 : (frame - startFrame) / (revealEnd - startFrame);
    } else if (mode === "trail" && frame > revealEnd) {
      progress = 1;
    }
    return [{ name: "clip-path", value: wipeClip(progress, parameters.layout.direction) }];
  }) ?? { keyframes: [
    { atFrame: 0, style: [{ name: "clip-path", value: wipeClip(1, parameters.layout.direction) }] },
    { atFrame: durationFrames, style: [{ name: "clip-path", value: wipeClip(1, parameters.layout.direction) }] },
  ] };
}

function typewriterAnimation(
  text: string,
  parameters: FineCaptionParameters,
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation | undefined {
  if (parameters.motion.atomReveal !== "typewriter") return undefined;
  const graphemes = Math.max(1, [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text)].length);
  const span = Math.max(1, endFrame - startFrame);
  const offsets = Array.from({ length: graphemes + 1 }, (_, index) => startFrame + Math.round(span * index / graphemes));
  return animationFrom(durationFrames, [...stepOffsets(startFrame), ...offsets], (frame) => {
    const progress = frame < startFrame ? 0 : Math.floor(clamp((frame - startFrame) / span, 0, 1) * graphemes) / graphemes;
    return [{ name: "clip-path", value: wipeClip(progress, parameters.layout.direction) }];
  });
}

function activeResponseAnimation(
  parameters: FineCaptionParameters,
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): VisualAnimation | undefined {
  const response = parameters.motion.activeResponse;
  if (response === "none") return undefined;
  if (response === "scale") {
    return animationFrom(durationFrames, stepOffsets(startFrame, endFrame), (frame) => {
      const active = frame >= startFrame && (frame < endFrame || (endFrame === durationFrames && frame === durationFrames));
      return [{ name: "transform", value: `scale(${compactNumber(active ? parameters.motion.activeScale : 1)})` }];
    });
  }
  const frames = Math.min(parameters.motion.activeResponseFrames, Math.max(1, endFrame - startFrame));
  return animationFrom(durationFrames, transitionOffsets(startFrame, frames, response), (frame) => {
    if (frame < startFrame || frame > startFrame + frames) return snapshotStyle(neutralMotion);
    const progress = clamp((frame - startFrame) / frames, 0, 1);
    if (response === "pop" || response === "spring") {
      const amplitude = parameters.motion.activeScale - 1;
      const responseScale = response === "pop"
        ? 1 + amplitude * Math.sin(Math.PI * progress)
        : 1 + amplitude * Math.exp(-4 * progress) * Math.sin(12 * progress);
      return [{ name: "transform", value: `scale(${compactNumber(responseScale)})` }];
    }
    return snapshotStyle(motionSnapshot(response, progress, parameters.motion.slideDistancePx));
  });
}

function loopAnimation(
  parameters: FineCaptionParameters,
  durationFrames: number,
  activeWindow?: { readonly start: number; readonly end: number },
): VisualAnimation | undefined {
  if (parameters.motion.loop === "none") return undefined;
  const period = parameters.motion.loopPeriodFrames;
  const start = activeWindow?.start ?? 0;
  const end = activeWindow?.end ?? durationFrames;
  const offsets: number[] = [...stepOffsets(start, end)];
  for (let frame = start; frame <= end; frame += Math.max(1, Math.round(period / 4))) offsets.push(frame);
  return animationFrom(durationFrames, offsets, (frame) => {
    const active = frame >= start && (frame < end || (end === durationFrames && frame === durationFrames));
    if (!active) return parameters.motion.loop === "glow-pulse"
      ? [{ name: "filter", value: "none" }]
      : parameters.motion.loop === "flicker" ? [{ name: "opacity", value: 1 }]
        : [{ name: "transform", value: "none" }];
    const phase = 2 * Math.PI * ((frame - start) % period) / period;
    if (parameters.motion.loop === "shake") {
      return [{ name: "transform", value: `translateX(${compactNumber(Math.sin(phase * 2) * 3 * parameters.motion.loopIntensity)}px)` }];
    }
    if (parameters.motion.loop === "wobble") {
      return [{ name: "transform", value: `rotate(${compactNumber(Math.sin(phase) * 2.5 * parameters.motion.loopIntensity)}deg)` }];
    }
    if (parameters.motion.loop === "breathe") {
      return [{ name: "transform", value: `scale(${compactNumber(1 + Math.sin(phase) * 0.035 * parameters.motion.loopIntensity)})` }];
    }
    if (parameters.motion.loop === "float") {
      return [{ name: "transform", value: `translateY(${compactNumber(Math.sin(phase) * 3.2 * parameters.motion.loopIntensity)}px)` }];
    }
    if (parameters.motion.loop === "pulse") {
      return [{ name: "transform", value: `scale(${compactNumber(1 + (Math.sin(phase) + 1) * 0.0375 * parameters.motion.loopIntensity)})` }];
    }
    if (parameters.motion.loop === "flicker") {
      return [{ name: "opacity", value: clamp(1 - (Math.sin(phase * 5) + 1) * 0.11 * parameters.motion.loopIntensity, 0.15, 1) }];
    }
    const strength = (0.35 + 0.65 * (Math.sin(phase) + 1) / 2) * parameters.motion.loopIntensity;
    const paint = activeWindow === undefined ? parameters.basePaint : parameters.activePaint;
    const color = paint.glow.opacity > 0 ? paint.glow.color : paint.fill;
    const opacity = paint.glow.opacity > 0 ? paint.glow.opacity : 0.65;
    const blur = paint.glow.blurPx > 0 ? paint.glow.blurPx : 8;
    return [{ name: "filter", value: `drop-shadow(0 0 ${compactNumber(blur * strength)}px ${alphaColor(color, opacity)})` }];
  });
}

function activeBoxAnimation(
  parameters: FineCaptionParameters,
  startFrame: number,
  endFrame: number,
  durationFrames: number,
  mode: "current" | "trail" = parameters.activeBox.mode === "off" ? "current" : parameters.activeBox.mode,
): VisualAnimation {
  const box = parameters.activeBox;
  const logicalEnd = mode === "trail" ? durationFrames : endFrame;
  const enterFrames = box.enter === "none" ? 0 : Math.min(box.transitionFrames, Math.max(0, logicalEnd - startFrame));
  const exitFrames = box.exit === "none" ? 0 : Math.min(box.transitionFrames, Math.max(0, logicalEnd - startFrame));
  const offsets = [
    ...stepOffsets(startFrame, logicalEnd),
    ...transitionOffsets(startFrame, enterFrames, box.enter),
    ...transitionOffsets(logicalEnd - exitFrames, exitFrames, box.exit),
  ];
  return animationFrom(durationFrames, offsets, (frame) => {
    if (frame < startFrame || frame > logicalEnd || (frame === logicalEnd && logicalEnd !== durationFrames)) {
      return [{ name: "opacity", value: 0 }, { name: "transform", value: "scale(0.82)" }];
    }
    const enterProgress = enterFrames === 0 ? 1 : clamp((frame - startFrame) / enterFrames, 0, 1);
    const exitProgress = exitFrames === 0 ? 1 : clamp((logicalEnd - frame) / exitFrames, 0, 1);
    const kind = enterProgress < 1 ? box.enter : box.exit;
    return snapshotStyle(motionSnapshot(kind, Math.min(enterProgress, exitProgress), parameters.motion.slideDistancePx));
  }) ?? { keyframes: [
    { atFrame: 0, style: [{ name: "opacity", value: 1 }] },
    { atFrame: durationFrames, style: [{ name: "opacity", value: 1 }] },
  ] };
}

function anchorTransform(parameters: FineCaptionParameters): string | undefined {
  const x = parameters.placement.anchorX === "left" ? 0 : parameters.placement.anchorX === "center" ? -50 : -100;
  const y = parameters.placement.anchorY === "top" ? 0 : parameters.placement.anchorY === "center" ? -50 : -100;
  return x === 0 && y === 0 ? undefined : `translate(${x}%,${y}%)`;
}

function cueElements(
  atoms: readonly CaptionAlignmentUnit[],
  atomFrames: ReadonlyMap<string, { readonly start: number; readonly end: number }>,
  parameters: FineCaptionParameters,
  wordText: ReadonlyMap<string, string>,
  durationFrames: number,
  styleId: string,
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
  const cueLoop = parameters.motion.loopTarget === "cue" ? loopAnimation(parameters, durationFrames) : undefined;
  const fonts = parameters.typography.exactFonts;
  push({
    id: "placement",
    kind: "box",
    style: [
      { name: "align-items", value: parameters.layout.blockAlign === "start" ? "flex-start"
        : parameters.layout.blockAlign === "end" ? "flex-end" : "center" },
      { name: "display", value: "flex" },
      { name: "justify-content", value: parameters.layout.textAlign === "left" ? "flex-start"
        : parameters.layout.textAlign === "right" ? "flex-end" : "center" },
      { name: "left", value: `${compactNumber(parameters.placement.x * 100)}%` },
      { name: "position", value: "absolute" },
      { name: "top", value: `${compactNumber(parameters.placement.y * 100)}%` },
      ...(parameters.placement.height === undefined ? [] : [
        { name: "height", value: `${compactNumber(parameters.placement.height * 100)}%` },
      ] as const),
      ...(transform === undefined ? [] : [{ name: "transform", value: transform }] as const),
      { name: "width", value: `${compactNumber(parameters.placement.width * 100)}%` },
    ],
  });
  push({
    id: "cue-motion",
    parent: "placement",
    kind: "box",
    style: [{ name: "display", value: "inline-flex" }, { name: "transform-origin", value: "center center" }],
    ...(cueMotion === undefined ? {} : { animation: cueMotion }),
  });
  push({
    id: "cue-loop",
    parent: "cue-motion",
    kind: "box",
    style: [{ name: "display", value: "inline-flex" }, { name: "transform-origin", value: "center center" }],
    ...(cueLoop === undefined ? {} : { animation: cueLoop }),
  });
  push({
    id: "cue",
    parent: "cue-loop",
    kind: "box",
    style: [
      { name: "background", value: parameters.cueBox.background },
      ...(parameters.cueBox.shadow.opacity === 0 ? [] : [{
        name: "box-shadow",
        value: `${compactNumber(parameters.cueBox.shadow.offsetXPx)}px ${compactNumber(parameters.cueBox.shadow.offsetYPx)}px ${compactNumber(parameters.cueBox.shadow.blurPx)}px ${compactNumber(parameters.cueBox.shadow.spreadPx)}px ${alphaColor(parameters.cueBox.shadow.color, parameters.cueBox.shadow.opacity)}`,
      }] as const),
      { name: "box-sizing", value: "border-box" },
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
      { name: "max-width", value: "100%" },
      ...(parameters.layout.maxLines === undefined ? [] : [{
        name: "max-height",
        value: `${compactNumber(parameters.typography.fontSizePx * parameters.layout.lineHeight * parameters.layout.maxLines + parameters.cueBox.paddingYPx * 2)}px`,
      }] as const),
      { name: "overflow", value: parameters.layout.overflow === "clip" ? "hidden" : "visible" },
      { name: "padding", value: `${compactNumber(parameters.cueBox.paddingYPx)}px ${compactNumber(parameters.cueBox.paddingXPx)}px` },
      { name: "position", value: "relative" },
      { name: "text-align", value: parameters.layout.textAlign },
      { name: "width", value: parameters.layout.inlineSize === "fixed" ? "100%" : "max-content" },
    ],
    attributes: [{ name: "data-caption-style", value: styleId }],
  });

  if (parameters.activeBox.mode === "trail" && parameters.activeBox.continuity === "joined") {
    for (const [prefixIndex, atom] of atoms.entries()) {
      const timing = atomFrames.get(atom.id);
      if (timing === undefined) throw new Error(`Fine Caption is missing timing for Atom ${atom.id}`);
      const next = atoms[prefixIndex + 1];
      const nextStart = next === undefined ? durationFrames : atomFrames.get(next.id)?.start;
      if (nextStart === undefined) throw new Error("Fine Caption is missing timing for the next Atom");
      const prefixText = atoms.slice(0, prefixIndex + 1).map((prefixAtom) => prefixAtom.wordIds
        .map((wordId) => {
          const text = wordText.get(wordId);
          if (text === undefined) throw new Error(`Fine Caption Atom references unknown word ${wordId}`);
          return text;
        }).join("\u00A0")).join(" ");
      const layerId = `joined-box-${prefixIndex + 1}`;
      push({
        id: layerId,
        parent: "cue",
        kind: "box",
        style: [
          { name: "box-sizing", value: "border-box" },
          { name: "direction", value: parameters.layout.direction },
          { name: "inset", value: "0" },
          { name: "padding", value: `${compactNumber(parameters.cueBox.paddingYPx)}px ${compactNumber(parameters.cueBox.paddingXPx)}px` },
          { name: "position", value: "absolute" },
          { name: "text-align", value: parameters.layout.textAlign },
        ],
        animation: activeBoxAnimation(parameters, timing.start, nextStart, durationFrames, "current"),
        attributes: [{ name: "data-caption-active-box", value: "joined" }],
      });
      push({
        id: `${layerId}-text`,
        parent: layerId,
        kind: "text",
        text: prefixText,
        style: [
          ...transparentGlyphStyle(parameters).filter(({ name }) => name !== "white-space"),
          { name: "-webkit-box-decoration-break", value: "clone" },
          { name: "background", value: parameters.activeBox.background },
          { name: "border-color", value: parameters.activeBox.borderColor },
          { name: "border-radius", value: `${compactNumber(parameters.activeBox.radiusPx)}px` },
          { name: "border-style", value: "solid" },
          { name: "border-width", value: `${compactNumber(parameters.activeBox.borderWidthPx)}px` },
          { name: "box-decoration-break", value: "clone" },
          { name: "display", value: "inline" },
          { name: "padding", value: `${compactNumber(parameters.activeBox.paddingYPx)}px ${compactNumber(parameters.activeBox.paddingXPx)}px` },
          { name: "white-space", value: "normal" },
        ],
        fonts,
      });
    }
  }

  let wordsOnLine = 0;
  for (const [atomIndex, atom] of atoms.entries()) {
    const timing = atomFrames.get(atom.id);
    if (timing === undefined) throw new Error(`Fine Caption is missing timing for Atom ${atom.id}`);
    const atomId = `atom-${atomIndex + 1}`;
    const atomText = atom.wordIds.map((wordId) => wordText.get(wordId) ?? "").join(" ");
    const entryId = `${atomId}-entry`;
    const typewriterId = `${atomId}-typewriter`;
    const loopId = `${atomId}-loop`;
    const responseId = `${atomId}-response`;
    if (parameters.layout.maxWordsPerLine !== undefined
      && wordsOnLine > 0
      && wordsOnLine + atom.wordIds.length > parameters.layout.maxWordsPerLine) {
      push({
        id: `line-break-${atomIndex}`,
        parent: "cue",
        kind: "box",
        style: [{ name: "flex-basis", value: "100%" }, { name: "height", value: "0" }],
      });
      wordsOnLine = 0;
    }
    const entryAnimation = atomLifecycleAnimation(parameters, timing.start, timing.end, durationFrames);
    const writerAnimation = typewriterAnimation(atomText, parameters, timing.start, timing.end, durationFrames);
    const atomLoop = parameters.motion.loopTarget === "active-atom"
      ? loopAnimation(parameters, durationFrames, timing) : undefined;
    const responseAnimation = activeResponseAnimation(parameters, timing.start, timing.end, durationFrames);
    push({
      id: entryId,
      parent: "cue",
      kind: "box",
      style: [
        { name: "display", value: "inline-flex" },
        { name: "min-width", value: "0" },
        { name: "transform-origin", value: "center center" },
      ],
      ...(entryAnimation === undefined ? {} : { animation: entryAnimation }),
    });
    push({
      id: typewriterId,
      parent: entryId,
      kind: "box",
      style: [
        { name: "display", value: "inline-flex" },
        { name: "min-width", value: "0" },
        { name: "transform-origin", value: parameters.layout.direction === "rtl" ? "right center" : "left center" },
      ],
      ...(writerAnimation === undefined ? {} : { animation: writerAnimation }),
    });
    push({
      id: loopId,
      parent: typewriterId,
      kind: "box",
      style: [
        { name: "display", value: "inline-flex" },
        { name: "min-width", value: "0" },
        { name: "transform-origin", value: "center center" },
      ],
      ...(atomLoop === undefined ? {} : { animation: atomLoop }),
    });
    push({
      id: responseId,
      parent: loopId,
      kind: "box",
      style: [
        { name: "display", value: "inline-flex" },
        { name: "min-width", value: "0" },
        { name: "transform-origin", value: "center center" },
      ],
      ...(responseAnimation === undefined ? {} : { animation: responseAnimation }),
    });
    push({
      id: atomId,
      parent: responseId,
      kind: "box",
      style: [
        { name: "column-gap", value: `${compactNumber(parameters.layout.wordGapPx)}px` },
        { name: "display", value: "inline-flex" },
        { name: "min-width", value: "0" },
        { name: "overflow-wrap", value: "anywhere" },
        { name: "position", value: "relative" },
        { name: "white-space", value: "normal" },
        { name: "word-break", value: parameters.layout.wrap === "grapheme" ? "break-all" : "normal" },
      ],
      attributes: [{ name: "data-caption-atom", value: atom.id }],
    });
    const useIsolatedBox = parameters.activeBox.mode !== "off"
      && !(parameters.activeBox.mode === "trail" && parameters.activeBox.continuity === "joined");
    if (useIsolatedBox) {
      push({
        id: `${atomId}-box`,
        parent: atomId,
        kind: "box",
        style: [
          { name: "background", value: parameters.activeBox.background },
          { name: "border-color", value: parameters.activeBox.borderColor },
          { name: "border-radius", value: `${compactNumber(parameters.activeBox.radiusPx)}px` },
          { name: "border-style", value: "solid" },
          { name: "border-width", value: `${compactNumber(parameters.activeBox.borderWidthPx)}px` },
          { name: "bottom", value: `${compactNumber(-parameters.activeBox.paddingYPx)}px` },
          { name: "left", value: `${compactNumber(-parameters.activeBox.paddingXPx)}px` },
          { name: "position", value: "absolute" },
          { name: "right", value: `${compactNumber(-parameters.activeBox.paddingXPx)}px` },
          { name: "top", value: `${compactNumber(-parameters.activeBox.paddingYPx)}px` },
          { name: "transform-origin", value: "center center" },
        ],
        animation: activeBoxAnimation(parameters, timing.start, timing.end, durationFrames),
        attributes: [{ name: "data-caption-active-box", value: "isolated" }],
      });
    }
    for (const [wordIndex, wordId] of atom.wordIds.entries()) {
      const text = wordText.get(wordId);
      if (text === undefined) throw new Error(`Fine Caption Atom references unknown word ${wordId}`);
      push({
        id: `${atomId}-base-${wordIndex + 1}`,
        parent: atomId,
        kind: "text",
        text,
        style: glyphStyle(parameters, parameters.basePaint, parameters.underline),
        ...glyphPaintFields(parameters.basePaint),
        fonts,
        attributes: [{ name: "data-caption-word", value: wordId }],
      });
    }
    const addActivatedTextLayer = (
      suffix: string,
      mode: "current" | "trail",
      kind: "glyph" | "underline",
    ): void => {
      const activeId = `${atomId}-${suffix}`;
      push({
        id: activeId,
        parent: atomId,
        kind: "box",
        style: [
          { name: "column-gap", value: `${compactNumber(parameters.layout.wordGapPx)}px` },
          { name: "display", value: "inline-flex" },
          { name: "inset", value: "0" },
          ...(kind === "glyph" && parameters.karaoke.transition === "wipe"
            ? [{ name: "overflow", value: "hidden" }] as const : []),
          { name: "position", value: "absolute" },
        ],
        animation: kind === "glyph" && parameters.karaoke.transition === "wipe"
          ? karaokeWipeAnimation(parameters, mode, timing.start, timing.end, durationFrames)
          : activationStepAnimation(mode, timing.start, timing.end, durationFrames),
        attributes: [{ name: kind === "glyph" ? "data-caption-karaoke" : "data-caption-active-underline", value: mode }],
      });
      for (const [wordIndex, wordId] of atom.wordIds.entries()) {
        const text = wordText.get(wordId)!;
        push({
          id: `${activeId}-${wordIndex + 1}`,
          parent: activeId,
          kind: "text",
          text,
          style: kind === "glyph"
            ? glyphStyle(parameters, parameters.activePaint)
            : transparentGlyphStyle(parameters, parameters.activeUnderline),
          // The underline layer paints no glyph at all, so it declares no glyph Paint either.
          ...(kind === "glyph" ? glyphPaintFields(parameters.activePaint) : {}),
          fonts,
          attributes: [{ name: kind === "glyph" ? "data-caption-active-word" : "data-caption-underlined-word", value: wordId }],
        });
      }
    };
    if (parameters.karaoke.mode !== "off") addActivatedTextLayer("active", parameters.karaoke.mode, "glyph");
    if (parameters.activeUnderline.mode !== "off") {
      addActivatedTextLayer("underline", parameters.activeUnderline.mode, "underline");
    }
    wordsOnLine += atom.wordIds.length;
  }
  return elements;
}

export function renderFineCaption(
  schedule: FineCaptionSchedule,
  program: CaptionProgram,
  document: CaptionDocument,
  space: ProgramSpace,
): VisualTrack {
  assertFineCaptionSchedule(schedule);
  assertCaptionProgramForDocument(program, document);
  if (schedule.documentId !== document.id) throw new Error("Fine Caption received another CaptionDocument");
  if (program.wordRuns.length !== 0) {
    throw new Error("Fine Caption accepts one uniform token rule and cannot consume word-specific Style runs");
  }
  assertProgramSpaceIdentity(space);
  const styles = new Map(program.styles.map((style) => [style.id, style]));
  const wordText = new Map(document.words.map((word) => [word.id, word.text]));
  const atomById = new Map(document.units.map((atom) => [atom.id, atom]));
  for (const style of styles.values()) {
    if (style.rendering.family !== FINE_CAPTION_FAMILY) {
      throw new Error(`Fine Caption cannot render Style family ${style.rendering.family}`);
    }
    assertFineCaptionParameters(style.rendering.parameters as unknown as FineCaptionParameters);
  }
  const totalFrames = programSpaceFrameCount(space);
  const presents = schedule.cues.flatMap((cue) => {
    const atoms = cue.units.map((timing) => atomById.get(timing.unitId));
    if (atoms.some((atom) => atom === undefined)) throw new Error(`Fine Caption Cue ${cue.id} references unknown Atom`);
    const resolvedAtoms = atoms.map((atom) => atom!);
    const style = styles.get(cue.styleId);
    if (style === undefined) throw new Error(`Fine Caption Cue ${cue.id} references unknown Style ${cue.styleId}`);
    const parameters = style.rendering.parameters as unknown as FineCaptionParameters;
    const startFrame = Math.max(0, cue.visibleStartFrame);
    const measuredEnd = Math.min(totalFrames, cue.visibleEndFrameExclusive);
    const endFrameExclusive = Math.min(totalFrames, Math.max(startFrame + 1, measuredEnd));
    if (startFrame >= totalFrames || endFrameExclusive <= startFrame) return [];
    const durationFrames = endFrameExclusive - startFrame;
    const atomFrames = new Map(cue.units.map((atom) => [atom.unitId, {
      start: clamp(atom.startFrame - startFrame, 0, durationFrames),
      end: clamp(Math.max(atom.endFrameExclusive - startFrame, atom.startFrame - startFrame + 1), 0, durationFrames),
    }]));
    return [{
      id: cue.id,
      span: { startFrame, endFrameExclusive },
      stacking: { order: parameters.stackingOrder, tieBreak: `${program.id}:${cue.id}` },
      elements: cueElements(resolvedAtoms, atomFrames, parameters, wordText, durationFrames, cue.styleId),
    }];
  });
  const track = sealVisualTrack({
    visualIr: "hypit.visual-ir@1",
    id: program.id,
    presents,
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
