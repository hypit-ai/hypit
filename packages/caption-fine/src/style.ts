import type { CaptionStyleIntent } from "@narratage/caption";
import { sealCaptionStyle } from "@narratage/caption";
import { assertFontArtifactRef } from "@narratage/media";
import type { FontArtifactRef } from "@narratage/media";
import type { SvsRecipe } from "@narratage/svs";

import type { FineCaptionGlyphPaint, FineCaptionParameters } from "./types.js";

export const FINE_CAPTION_FAMILY = "@narratage/caption-fine@1";

const REQUIRED_PROPERTIES = [
  "align", "background", "cue-max-words", "cue-min-words", "fill", "font",
  "line-height", "padding", "radius", "size", "stack-order", "weight", "width", "x", "y",
] as const;

const OPTIONAL_PROPERTIES = [
  "active-fill", "active-glow-blur", "active-glow-color", "active-glow-opacity", "active-opacity",
  "active-scale", "active-shadow-blur", "active-shadow-color", "active-shadow-opacity", "active-shadow-x",
  "active-shadow-y", "active-stroke-color", "active-stroke-width", "anchor-x", "anchor-y", "atom-reveal",
  "border-color", "border-width", "cue-enter", "cue-exit", "cue-transition-frames", "direction", "font-style",
  "glow-blur", "glow-color", "glow-opacity", "karaoke", "karaoke-transition", "letter-spacing", "opacity",
  "shadow-blur", "shadow-color", "shadow-opacity", "shadow-x", "shadow-y", "stroke-color", "stroke-width",
  "word-gap",
] as const;

const ALLOWED_PROPERTIES = new Set<string>([...REQUIRED_PROPERTIES, ...OPTIONAL_PROPERTIES]);

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

function glyphPaint(recipe: SvsRecipe, prefix: "" | "active-", base?: FineCaptionGlyphPaint): FineCaptionGlyphPaint {
  const fallback = <K extends keyof FineCaptionGlyphPaint>(key: K): FineCaptionGlyphPaint[K] | undefined => base?.[key];
  const baseShadow = fallback("shadow") as FineCaptionGlyphPaint["shadow"] | undefined;
  const baseGlow = fallback("glow") as FineCaptionGlyphPaint["glow"] | undefined;
  const baseStroke = fallback("stroke") as FineCaptionGlyphPaint["stroke"] | undefined;
  return {
    fill: color(recipe, `${prefix}fill`, prefix === "active-" ? "#FFD54A" : base?.fill),
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
    },
    glow: {
      color: color(recipe, `${prefix}glow-color`, baseGlow?.color ?? "#FFFFFF"),
      opacity: number(recipe, `${prefix}glow-opacity`, baseGlow?.opacity ?? 0),
      blurPx: number(recipe, `${prefix}glow-blur`, baseGlow?.blurPx ?? 0),
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
  assertColor(value.glow.color, `${label} glow color`);
  assertOpacity(value.shadow.opacity, `${label} shadow opacity`);
  assertOpacity(value.glow.opacity, `${label} glow opacity`);
  for (const [name, metric] of [
    ["stroke width", value.stroke.widthPx], ["shadow blur", value.shadow.blurPx], ["glow blur", value.glow.blurPx],
  ] as const) {
    if (!Number.isFinite(metric) || metric < 0) throw new Error(`${label} ${name} is invalid`);
  }
  if (!Number.isFinite(value.shadow.offsetXPx) || !Number.isFinite(value.shadow.offsetYPx)) {
    throw new Error(`${label} shadow offset is invalid`);
  }
}

export function fineCaptionParameters(
  recipe: SvsRecipe,
  exactFonts: readonly FontArtifactRef[] = [],
): FineCaptionParameters {
  for (const name of REQUIRED_PROPERTIES) required(recipe, name);
  const unknown = Object.keys(recipe.properties).filter((name) => !ALLOWED_PROPERTIES.has(name));
  if (unknown.length > 0) throw new Error(`Fine Caption Recipe contains unknown property ${unknown[0]}`);

  const pad = padding(string(recipe, "padding"));
  const fontSizePx = number(recipe, "size");
  const basePaint = glyphPaint(recipe, "");
  const parameters: FineCaptionParameters = {
    contract: "svml.caption-fine-parameters@1",
    stackingOrder: integer(recipe, "stack-order"),
    placement: {
      x: number(recipe, "x"),
      y: number(recipe, "y"),
      width: number(recipe, "width"),
      anchorX: choice(recipe, "anchor-x", ["left", "center", "right"] as const, "left"),
      anchorY: choice(recipe, "anchor-y", ["top", "center", "bottom"] as const, "top"),
    },
    layout: {
      textAlign: choice(recipe, "align", ["left", "center", "right"] as const),
      direction: choice(recipe, "direction", ["ltr", "rtl"] as const, "ltr"),
      lineHeight: number(recipe, "line-height"),
      letterSpacingPx: number(recipe, "letter-spacing", 0),
      wordGapPx: number(recipe, "word-gap", fontSizePx * 0.25),
    },
    typography: {
      fontFamily: string(recipe, "font"),
      fontSizePx,
      fontWeight: integer(recipe, "weight"),
      fontStyle: choice(recipe, "font-style", ["normal", "italic", "oblique"] as const, "normal"),
      ...(exactFonts.length === 0 ? {} : { exactFonts: [...exactFonts] }),
    },
    basePaint,
    activePaint: glyphPaint(recipe, "active-", basePaint),
    cueBox: {
      background: color(recipe, "background"),
      borderColor: color(recipe, "border-color", "#00000000"),
      borderWidthPx: number(recipe, "border-width", 0),
      paddingXPx: pad.x,
      paddingYPx: pad.y,
      radiusPx: number(recipe, "radius"),
    },
    karaoke: {
      mode: choice(recipe, "karaoke", ["off", "current", "trail"] as const, "off"),
      transition: choice(recipe, "karaoke-transition", ["step", "wipe"] as const, "step"),
    },
    motion: {
      cueEnter: choice(recipe, "cue-enter", ["none", "fade"] as const, "none"),
      cueExit: choice(recipe, "cue-exit", ["none", "fade"] as const, "none"),
      cueTransitionFrames: integer(recipe, "cue-transition-frames", 0),
      atomReveal: choice(recipe, "atom-reveal", ["all", "on-start"] as const, "all"),
      activeScale: number(recipe, "active-scale", 1),
    },
  };
  assertFineCaptionParameters(parameters);
  return parameters;
}

export function assertFineCaptionParameters(value: FineCaptionParameters): void {
  if (value.contract !== "svml.caption-fine-parameters@1") throw new Error("Unsupported Fine Caption parameters");
  if (!Number.isSafeInteger(value.stackingOrder) || value.stackingOrder < 0) {
    throw new Error("Fine Caption stacking order is invalid");
  }
  const nonNegative = [
    value.placement.x, value.placement.y, value.placement.width, value.typography.fontSizePx,
    value.typography.fontWeight, value.layout.lineHeight, value.layout.wordGapPx, value.cueBox.paddingXPx,
    value.cueBox.paddingYPx, value.cueBox.radiusPx, value.cueBox.borderWidthPx, value.motion.cueTransitionFrames,
  ];
  if (nonNegative.some((item) => !Number.isFinite(item) || item < 0)
    || value.placement.x > 1 || value.placement.y > 1 || value.placement.width <= 0 || value.placement.width > 1
    || value.typography.fontSizePx <= 0 || value.layout.lineHeight <= 0
    || !Number.isSafeInteger(value.motion.cueTransitionFrames) || value.motion.activeScale <= 0
    || !Number.isFinite(value.motion.activeScale) || !Number.isFinite(value.layout.letterSpacingPx)) {
    throw new Error("Fine Caption parameters contain invalid numeric bounds");
  }
  if (!value.typography.fontFamily.trim() || value.typography.fontWeight < 1 || value.typography.fontWeight > 1000) {
    throw new Error("Fine Caption typography is invalid");
  }
  if (value.typography.exactFonts !== undefined) {
    if (value.typography.exactFonts.length === 0) throw new Error("Fine Caption exact Font stack is empty");
    const artifacts = new Set<string>();
    for (const [index, font] of value.typography.exactFonts.entries()) {
      assertFontArtifactRef(font, `Fine Caption exact Font ${index + 1}`);
      if (font.weight !== value.typography.fontWeight || font.style !== value.typography.fontStyle) {
        throw new Error("Fine Caption exact Font faces must match Recipe weight and font-style");
      }
      if (artifacts.has(font.artifact.digest)) throw new Error("Fine Caption exact Font stack contains a duplicate face");
      artifacts.add(font.artifact.digest);
    }
  }
  assertColor(value.cueBox.background, "Fine Caption background");
  assertColor(value.cueBox.borderColor, "Fine Caption border color");
  assertPaint(value.basePaint, "Fine Caption base Paint");
  assertPaint(value.activePaint, "Fine Caption active Paint");
}

export function fineCaptionStyle(
  id: string,
  recipe: SvsRecipe,
  exactFonts: readonly FontArtifactRef[] = [],
): CaptionStyleIntent {
  const minimumWords = integer(recipe, "cue-min-words");
  const maximumWords = integer(recipe, "cue-max-words");
  if (minimumWords <= 0 || maximumWords < minimumWords) {
    throw new Error("Fine Caption Recipe Cue word bounds are invalid");
  }
  return sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: {
      cue: {
        minimumWords,
        maximumWords,
        instruction: `Split into complete semantic phrases of ${minimumWords} to ${maximumWords} display words. Never cut inside an Atom and avoid crossing punctuation. An indivisible Atom may exceed the requested maximum.`,
      },
      fields: [],
    },
    rendering: {
      family: FINE_CAPTION_FAMILY,
      parameters: fineCaptionParameters(recipe, exactFonts),
    },
  });
}
