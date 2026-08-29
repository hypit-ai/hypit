import type { CaptionStyleIntent } from "@hypit/caption";
import { sealCaptionStyle } from "@hypit/caption";
import { assertFontArtifactRef } from "@hypit/media";
import type { FontArtifactRef } from "@hypit/media";
import { canonicalStringify } from "@hypit/protocol";
import type { SvsRecipe } from "@hypit/svs";

import type { FineCaptionGlyphPaint, FineCaptionParameters } from "./types.js";
import {
  fineCaptionOneShotMotions,
  fineCaptionOptionalRecipeProperties,
  fineCaptionRequiredRecipeProperties,
} from "./recipe.js";

export const FINE_CAPTION_FAMILY = "@hypit/caption-fine@1";

const ALLOWED_PROPERTIES = new Set<string>([
  ...fineCaptionRequiredRecipeProperties,
  ...fineCaptionOptionalRecipeProperties,
]);

function required(value: SvsRecipe, name: string): unknown {
  if (!Object.hasOwn(value.properties, name)) throw new Error(`Fine Caption Recipe requires ${name}`);
  return value.properties[name];
}

function number(value: SvsRecipe, name: string, fallback?: number): number {
  const property = Object.hasOwn(value.properties, name) ? value.properties[name] : fallback;
  if (typeof property !== "number" || !Number.isFinite(property)) {
    throw new Error(`Fine Caption Recipe ${name} must be a number`);
  }
  return property;
}

function integer(value: SvsRecipe, name: string, fallback?: number): number {
  const property = number(value, name, fallback);
  if (!Number.isSafeInteger(property)) throw new Error(`Fine Caption Recipe ${name} must be an integer`);
  return property;
}

function string(value: SvsRecipe, name: string, fallback?: string): string {
  const property = Object.hasOwn(value.properties, name) ? value.properties[name] : fallback;
  if (typeof property !== "string" || !property.trim()) {
    throw new Error(`Fine Caption Recipe ${name} must be a string`);
  }
  return property.trim();
}

function choice<const T extends readonly string[]>(
  value: SvsRecipe,
  name: string,
  choices: T,
  fallback?: T[number],
): T[number] {
  const property = string(value, name, fallback);
  if (!choices.includes(property)) throw new Error(`Fine Caption Recipe ${name} is invalid`);
  return property as T[number];
}

function color(value: SvsRecipe, name: string, fallback?: string): string {
  const property = string(value, name, fallback);
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(property)) {
    throw new Error(`Fine Caption Recipe ${name} must be an RGB or RGBA hex color`);
  }
  return property;
}

function padding(value: string): { readonly x: number; readonly y: number } {
  const parts = value.trim().split(/\s+/u).map(Number);
  if ((parts.length !== 1 && parts.length !== 2) || parts.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new Error("Fine Caption Recipe padding must contain one or two non-negative pixel numbers");
  }
  return { y: parts[0]!, x: parts[1] ?? parts[0]! };
}

function optionalGradient(
  recipe: SvsRecipe,
  prefix: "" | "active-",
  base?: FineCaptionGlyphPaint["gradient"],
): FineCaptionGlyphPaint["gradient"] | undefined {
  const fromName = `${prefix}gradient-from`;
  const toName = `${prefix}gradient-to`;
  const hasFrom = Object.hasOwn(recipe.properties, fromName);
  const hasTo = Object.hasOwn(recipe.properties, toName);
  const hasAngle = Object.hasOwn(recipe.properties, `${prefix}gradient-angle`);
  if (!hasFrom && !hasTo && !hasAngle) return prefix === "active-" ? undefined : base;
  if (!hasFrom || !hasTo) {
    throw new Error(`Fine Caption Recipe ${prefix}gradient requires both from and to colors`);
  }
  return {
    from: color(recipe, fromName),
    to: color(recipe, toName),
    angleDeg: number(recipe, `${prefix}gradient-angle`, base?.angleDeg ?? 90),
  };
}

function glyphPaint(recipe: SvsRecipe, prefix: "" | "active-", base?: FineCaptionGlyphPaint): FineCaptionGlyphPaint {
  const fallback = <K extends keyof FineCaptionGlyphPaint>(key: K): FineCaptionGlyphPaint[K] | undefined => base?.[key];
  const baseShadow = fallback("shadow") as FineCaptionGlyphPaint["shadow"] | undefined;
  const baseGlow = fallback("glow") as FineCaptionGlyphPaint["glow"] | undefined;
  const baseStroke = fallback("stroke") as FineCaptionGlyphPaint["stroke"] | undefined;
  const baseLongShadow = fallback("longShadow") as FineCaptionGlyphPaint["longShadow"] | undefined;
  const gradient = optionalGradient(recipe, prefix, base?.gradient);
  return {
    fill: color(recipe, `${prefix}fill`, prefix === "active-" ? "#FFD54A" : base?.fill),
    ...(gradient === undefined ? {} : { gradient }),
    opacity: number(recipe, `${prefix}opacity`, base?.opacity ?? 1),
    stroke: {
      color: color(recipe, `${prefix}stroke-color`, baseStroke?.color ?? "#000000"),
      widthPx: number(recipe, `${prefix}stroke-width`, baseStroke?.widthPx ?? 0),
    },
    shadow: {
      color: color(recipe, `${prefix}shadow-color`, baseShadow?.color ?? "#000000"),
      opacity: number(recipe, `${prefix}shadow-opacity`, baseShadow?.opacity ?? 0),
      offsetXPx: number(recipe, `${prefix}shadow-x`, baseShadow?.offsetXPx ?? 0),
      offsetYPx: number(recipe, `${prefix}shadow-y`, baseShadow?.offsetYPx ?? 0),
      blurPx: number(recipe, `${prefix}shadow-blur`, baseShadow?.blurPx ?? 0),
      spreadPx: number(recipe, `${prefix}shadow-spread`, baseShadow?.spreadPx ?? 0),
    },
    longShadow: {
      color: color(recipe, `${prefix}long-shadow-color`, baseLongShadow?.color ?? "#000000"),
      opacity: number(recipe, `${prefix}long-shadow-opacity`, baseLongShadow?.opacity ?? 0),
      distancePx: number(recipe, `${prefix}long-shadow-distance`, baseLongShadow?.distancePx ?? 0),
      angleDeg: number(recipe, `${prefix}long-shadow-angle`, baseLongShadow?.angleDeg ?? 45),
    },
    glow: {
      color: color(recipe, `${prefix}glow-color`, baseGlow?.color ?? "#FFFFFF"),
      opacity: number(recipe, `${prefix}glow-opacity`, baseGlow?.opacity ?? 0),
      blurPx: number(recipe, `${prefix}glow-blur`, baseGlow?.blurPx ?? 0),
      spreadPx: number(recipe, `${prefix}glow-spread`, baseGlow?.spreadPx ?? 0),
    },
  };
}

function assertColor(value: string, label: string): void {
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value)) throw new Error(`${label} is invalid`);
}

function assertOpacity(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
}

function assertPaint(value: FineCaptionGlyphPaint, label: string): void {
  assertColor(value.fill, `${label} fill`);
  assertOpacity(value.opacity, `${label} opacity`);
  assertColor(value.stroke.color, `${label} stroke color`);
  assertColor(value.shadow.color, `${label} shadow color`);
  assertColor(value.longShadow.color, `${label} long shadow color`);
  assertColor(value.glow.color, `${label} glow color`);
  assertOpacity(value.shadow.opacity, `${label} shadow opacity`);
  assertOpacity(value.longShadow.opacity, `${label} long shadow opacity`);
  assertOpacity(value.glow.opacity, `${label} glow opacity`);
  for (const [name, metric] of [
    ["stroke width", value.stroke.widthPx], ["shadow blur", value.shadow.blurPx],
    ["long shadow distance", value.longShadow.distancePx], ["glow blur", value.glow.blurPx],
    ["glow spread", value.glow.spreadPx],
  ] as const) {
    if (!Number.isFinite(metric) || metric < 0) throw new Error(`${label} ${name} is invalid`);
  }
  if (!Number.isFinite(value.shadow.offsetXPx) || !Number.isFinite(value.shadow.offsetYPx)
    || !Number.isFinite(value.shadow.spreadPx)) {
    throw new Error(`${label} shadow offset is invalid`);
  }
  if (!Number.isFinite(value.longShadow.angleDeg)) throw new Error(`${label} long shadow angle is invalid`);
  if (value.gradient !== undefined) {
    assertColor(value.gradient.from, `${label} gradient from`);
    assertColor(value.gradient.to, `${label} gradient to`);
    if (!Number.isFinite(value.gradient.angleDeg)) throw new Error(`${label} gradient angle is invalid`);
  }
}

export function fineCaptionParameters(
  recipe: SvsRecipe,
  exactFonts: readonly FontArtifactRef[],
): FineCaptionParameters {
  for (const name of fineCaptionRequiredRecipeProperties) required(recipe, name);
  const unknown = Object.keys(recipe.properties).filter((name) => !ALLOWED_PROPERTIES.has(name));
  if (unknown.length > 0) throw new Error(`Fine Caption Recipe contains unknown property ${unknown[0]}`);

  const pad = padding(string(recipe, "padding"));
  const activeBoxPadding = padding(string(recipe, "active-box-padding", "0"));
  const fontSizePx = number(recipe, "size");
  const basePaint = glyphPaint(recipe, "");
  const cueEnter = choice(recipe, "cue-enter", fineCaptionOneShotMotions, "none");
  const parameters: FineCaptionParameters = {

    stackingOrder: integer(recipe, "stack-order"),
    placement: {
      x: number(recipe, "x"),
      y: number(recipe, "y"),
      width: number(recipe, "width"),
      ...(Object.hasOwn(recipe.properties, "height") ? { height: number(recipe, "height") } : {}),
      anchorX: choice(recipe, "anchor-x", ["left", "center", "right"] as const, "left"),
      anchorY: choice(recipe, "anchor-y", ["top", "center", "bottom"] as const, "top"),
    },
    layout: {
      textAlign: choice(recipe, "align", ["left", "center", "right"] as const),
      blockAlign: choice(recipe, "block-align", ["start", "center", "end"] as const, "center"),
      direction: choice(recipe, "direction", ["ltr", "rtl"] as const, "ltr"),
      inlineSize: choice(recipe, "inline-size", ["hug", "fixed"] as const, "hug"),
      wrap: choice(recipe, "wrap", ["word", "grapheme"] as const, "word"),
      ...(Object.hasOwn(recipe.properties, "max-lines") ? { maxLines: integer(recipe, "max-lines") } : {}),
      ...(Object.hasOwn(recipe.properties, "max-words-per-line")
        ? { maxWordsPerLine: integer(recipe, "max-words-per-line") } : {}),
      lineHeight: number(recipe, "line-height"),
      letterSpacingPx: number(recipe, "letter-spacing", 0),
      wordGapPx: number(recipe, "word-gap", fontSizePx * 0.25),
    },
    typography: {
      fontSizePx,
      kerning: choice(recipe, "kerning", ["auto", "normal", "none"] as const, "auto"),
      variantCaps: choice(recipe, "caps", ["normal", "small-caps", "all-small-caps"] as const, "normal"),
      textTransform: choice(recipe, "text-transform", ["none", "uppercase", "lowercase", "capitalize"] as const, "none"),
      exactFonts: [...exactFonts],
    },
    basePaint,
    activePaint: glyphPaint(recipe, "active-", basePaint),
    underline: {
      mode: choice(recipe, "underline", ["off", "always"] as const, "off"),
      color: color(recipe, "underline-color", basePaint.fill),
      thicknessPx: number(recipe, "underline-thickness", 2),
      offsetPx: number(recipe, "underline-offset", 4),
    },
    activeUnderline: {
      mode: choice(recipe, "active-underline", ["off", "current", "trail"] as const, "off"),
      color: color(recipe, "active-underline-color", "#FFD54A"),
      thicknessPx: number(recipe, "active-underline-thickness", 3),
      offsetPx: number(recipe, "active-underline-offset", 4),
    },
    cueBox: {
      background: color(recipe, "background"),
      borderColor: color(recipe, "border-color", "#00000000"),
      borderWidthPx: number(recipe, "border-width", 0),
      paddingXPx: pad.x,
      paddingYPx: pad.y,
      radiusPx: number(recipe, "radius"),
      shadow: {
        color: color(recipe, "cue-shadow-color", "#000000"),
        opacity: number(recipe, "cue-shadow-opacity", 0),
        offsetXPx: number(recipe, "cue-shadow-x", 0),
        offsetYPx: number(recipe, "cue-shadow-y", 0),
        blurPx: number(recipe, "cue-shadow-blur", 0),
        spreadPx: number(recipe, "cue-shadow-spread", 0),
      },
    },
    karaoke: {
      mode: choice(recipe, "karaoke", ["off", "current", "trail"] as const, "off"),
      transition: choice(recipe, "karaoke-transition", ["step", "wipe"] as const, "step"),
    },
    activeBox: {
      mode: choice(recipe, "active-box", ["off", "current", "trail"] as const, "off"),
      continuity: choice(recipe, "active-box-continuity", ["isolated", "joined"] as const, "isolated"),
      background: color(recipe, "active-box-background", "#FFD54A"),
      borderColor: color(recipe, "active-box-border-color", "#00000000"),
      borderWidthPx: number(recipe, "active-box-border-width", 0),
      paddingXPx: activeBoxPadding.x,
      paddingYPx: activeBoxPadding.y,
      radiusPx: number(recipe, "active-box-radius", 8),
      enter: choice(recipe, "active-box-enter", fineCaptionOneShotMotions, "none"),
      exit: choice(recipe, "active-box-exit", fineCaptionOneShotMotions, "none"),
      transitionFrames: integer(recipe, "active-box-transition-frames", 0),
    },
    motion: {
      cueEnter,
      cueExit: choice(recipe, "cue-exit", fineCaptionOneShotMotions, "none"),
      cueEnterFrames: integer(recipe, "cue-enter-frames", 0),
      cueExitFrames: integer(recipe, "cue-exit-frames", 0),
      ...(Object.hasOwn(recipe.properties, "cue-enter-start-scale")
        ? { cueEnterStartScale: number(recipe, "cue-enter-start-scale") } : {}),
      atomEnter: choice(recipe, "atom-enter", fineCaptionOneShotMotions, "none"),
      atomEnterFrames: integer(recipe, "atom-enter-frames", 0),
      atomExit: choice(recipe, "atom-exit", fineCaptionOneShotMotions, "none"),
      atomExitFrames: integer(recipe, "atom-exit-frames", 0),
      atomReveal: choice(recipe, "atom-reveal", ["all", "on-start", "typewriter"] as const, "all"),
      activeResponse: choice(recipe, "active-response", fineCaptionOneShotMotions, "none"),
      activeResponseFrames: integer(recipe, "active-response-frames", 6),
      activeScale: number(recipe, "active-scale", 1.08),
      slideDistancePx: number(recipe, "slide-distance", 24),
      loop: choice(recipe, "loop", ["none", "shake", "wobble", "glow-pulse", "breathe", "float", "pulse", "flicker"] as const, "none"),
      loopTarget: choice(recipe, "loop-target", ["cue", "active-atom"] as const, "cue"),
      loopPeriodFrames: integer(recipe, "loop-period-frames", 12),
      loopIntensity: number(recipe, "loop-intensity", 1),
    },
    timing: {
      leadFrames: integer(recipe, "lead-frames", 0),
      tailFrames: integer(recipe, "tail-frames", 0),
      handoff: choice(recipe, "handoff", ["cut", "overlap"] as const, "cut"),
    },
  };
  assertFineCaptionParameters(parameters);
  return parameters;
}

export function assertFineCaptionParameters(value: FineCaptionParameters): void {
  if (!Number.isSafeInteger(value.stackingOrder) || value.stackingOrder < 0) {
    throw new Error("Fine Caption stacking order is invalid");
  }
  const nonNegative = [
    value.placement.x, value.placement.y, value.placement.width, value.typography.fontSizePx,
    value.layout.lineHeight, value.layout.wordGapPx, value.cueBox.paddingXPx,
    value.cueBox.paddingYPx, value.cueBox.radiusPx, value.cueBox.borderWidthPx,
    value.underline.thicknessPx, value.underline.offsetPx, value.activeUnderline.thicknessPx,
    value.activeUnderline.offsetPx, value.activeBox.borderWidthPx, value.activeBox.paddingXPx,
    value.activeBox.paddingYPx, value.activeBox.radiusPx, value.activeBox.transitionFrames,
    value.motion.cueEnterFrames, value.motion.cueExitFrames, value.motion.atomEnterFrames, value.motion.atomExitFrames,
    value.motion.activeResponseFrames,
    value.motion.slideDistancePx, value.motion.loopPeriodFrames, value.motion.loopIntensity,
    value.timing.leadFrames, value.timing.tailFrames,
    value.cueBox.shadow.blurPx,
  ];
  if (nonNegative.some((item) => !Number.isFinite(item) || item < 0)
    || value.placement.x > 1 || value.placement.y > 1 || value.placement.width <= 0 || value.placement.width > 1
    || (value.placement.height !== undefined && (!Number.isFinite(value.placement.height) || value.placement.height <= 0 || value.placement.height > 1))
    || value.typography.fontSizePx <= 0 || value.layout.lineHeight <= 0
    || !Number.isSafeInteger(value.motion.cueEnterFrames) || !Number.isSafeInteger(value.motion.cueExitFrames)
    || !Number.isSafeInteger(value.motion.atomEnterFrames) || !Number.isSafeInteger(value.motion.atomExitFrames)
    || !Number.isSafeInteger(value.motion.loopPeriodFrames)
    || !Number.isSafeInteger(value.motion.activeResponseFrames)
    || !Number.isSafeInteger(value.activeBox.transitionFrames) || value.motion.loopPeriodFrames <= 0
    || !Number.isSafeInteger(value.timing.leadFrames) || !Number.isSafeInteger(value.timing.tailFrames)
    || (value.layout.maxLines !== undefined && (!Number.isSafeInteger(value.layout.maxLines) || value.layout.maxLines <= 0))
    || (value.layout.maxWordsPerLine !== undefined && (!Number.isSafeInteger(value.layout.maxWordsPerLine) || value.layout.maxWordsPerLine <= 0))
    || (value.motion.cueEnterStartScale !== undefined
      && (!Number.isFinite(value.motion.cueEnterStartScale) || value.motion.cueEnterStartScale < 0))
    || value.motion.activeScale <= 0
    || !Number.isFinite(value.motion.activeScale) || !Number.isFinite(value.layout.letterSpacingPx)) {
    throw new Error("Fine Caption parameters contain invalid numeric bounds");
  }
  if (value.motion.cueEnter === "none"
    && value.motion.cueEnterStartScale !== undefined) {
    throw new Error("Fine Caption Cue entrance modifiers require a Cue entrance motion");
  }
  if (value.typography.exactFonts.length === 0) throw new Error("Fine Caption exact Font stack is empty");
  const faces = new Set<string>();
  for (const [index, font] of value.typography.exactFonts.entries()) {
    assertFontArtifactRef(font, `Fine Caption exact Font ${index + 1}`);
    const identity = canonicalStringify(font);
    if (faces.has(identity)) throw new Error("Fine Caption exact Font stack contains a duplicate face");
    faces.add(identity);
  }
  if (value.layout.maxLines !== undefined && value.layout.maxWordsPerLine === undefined) {
    throw new Error("Fine Caption max-lines requires max-words-per-line so its rows are structural");
  }
  assertColor(value.cueBox.background, "Fine Caption background");
  assertColor(value.cueBox.borderColor, "Fine Caption border color");
  assertColor(value.cueBox.shadow.color, "Fine Caption Cue shadow color");
  assertOpacity(value.cueBox.shadow.opacity, "Fine Caption Cue shadow opacity");
  if (![value.cueBox.shadow.offsetXPx, value.cueBox.shadow.offsetYPx, value.cueBox.shadow.spreadPx]
    .every(Number.isFinite)) throw new Error("Fine Caption Cue shadow contains an invalid metric");
  assertColor(value.underline.color, "Fine Caption underline color");
  assertColor(value.activeUnderline.color, "Fine Caption active underline color");
  assertColor(value.activeBox.background, "Fine Caption active box background");
  assertColor(value.activeBox.borderColor, "Fine Caption active box border color");
  assertPaint(value.basePaint, "Fine Caption base Paint");
  assertPaint(value.activePaint, "Fine Caption active Paint");
}

export function fineCaptionStyle(
  id: string,
  recipe: SvsRecipe,
  exactFonts: readonly FontArtifactRef[],
): CaptionStyleIntent {
  return sealCaptionStyle({
    id,
    rendering: {
      family: FINE_CAPTION_FAMILY,
      parameters: fineCaptionParameters(recipe, exactFonts),
    },
  });
}
