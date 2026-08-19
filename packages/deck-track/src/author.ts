import {
  decodeMediaFit,
  decodeMediaFramePaint,
  decodeMediaMotion,
  decodeMediaPresentation,
  decodeMediaSampleSpec,
  mediaAppearanceKeys,
} from "@hypit/media-track";
import type {
  MediaPaintLayerSpec,
  MediaSampleLayerSpec,
} from "@hypit/media-track";
import type { ContentFit } from "@hypit/spatial";
import type { SvsRecipe } from "@hypit/svs";

import {
  sealDepthStackCardSpec,
  sealDepthStackSpec,
} from "./program.js";
import type {
  DeckCardTone,
  DepthStackCardSpec,
  DepthStackPoseStep,
  DepthStackSpec,
} from "./types.js";

const DECK_KEYS = [
  "visible-previous", "visible-next", "wrap",
  "current-x", "current-y", "current-scale", "current-rotation", "current-opacity", "current-stacking",
  "current-brightness", "current-contrast", "current-saturation",
  "previous-x-step", "previous-y-step", "previous-scale-step", "previous-rotation-step",
  "previous-rotation-mode", "previous-opacity-step", "previous-stacking-step",
  "previous-brightness-step", "previous-contrast-step", "previous-saturation-step",
  "next-x-step", "next-y-step", "next-scale-step", "next-rotation-step",
  "next-rotation-mode", "next-opacity-step", "next-stacking-step",
  "next-brightness-step", "next-contrast-step", "next-saturation-step",
  "reflow-frames", "reflow-easing", "playback-future", "playback-past",
] as const;

function fail(recipe: SvsRecipe, message: string): never {
  throw new Error(`DepthStack Recipe ${recipe.path} ${message}`);
}

function optionalNumber(recipe: SvsRecipe, name: string): number | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function number(recipe: SvsRecipe, name: string, fallback: number): number {
  return optionalNumber(recipe, name) ?? fallback;
}

function integer(recipe: SvsRecipe, name: string, fallback: number): number {
  const value = number(recipe, name, fallback);
  if (!Number.isSafeInteger(value)) fail(recipe, `${name} must be an integer.`);
  return value;
}

function optionalString(recipe: SvsRecipe, name: string): string | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function oneOf<T extends string>(
  recipe: SvsRecipe,
  name: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = optionalString(recipe, name) ?? fallback;
  if (!values.includes(value as T)) fail(recipe, `${name} must be ${values.join(" | ")}.`);
  return value as T;
}

function boolean(recipe: SvsRecipe, name: string, fallback: boolean): boolean {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(recipe, `${name} must be boolean.`);
  return value;
}

function mediaRecipe(recipe: SvsRecipe, keys: readonly string[]): SvsRecipe {
  const selected: Record<string, SvsRecipe["properties"][string]> = {};
  for (const key of keys) {
    const value = recipe.properties[key];
    if (value !== undefined) selected[key] = value;
  }
  return { ...recipe, properties: selected };
}

function tone(recipe: SvsRecipe, prefix: string, fallback: DeckCardTone): DeckCardTone {
  return {
    brightness: number(recipe, `${prefix}-brightness`, fallback.brightness),
    contrast: number(recipe, `${prefix}-contrast`, fallback.contrast),
    saturation: number(recipe, `${prefix}-saturation`, fallback.saturation),
  };
}

function step(
  recipe: SvsRecipe,
  prefix: "previous" | "next",
  defaults: DepthStackPoseStep,
): DepthStackPoseStep {
  return {
    xPerDepthPx: number(recipe, `${prefix}-x-step`, defaults.xPerDepthPx),
    yPerDepthPx: number(recipe, `${prefix}-y-step`, defaults.yPerDepthPx),
    scalePerDepth: number(recipe, `${prefix}-scale-step`, defaults.scalePerDepth),
    rotationPerDepthDeg: number(recipe, `${prefix}-rotation-step`, defaults.rotationPerDepthDeg),
    rotationMode: oneOf(recipe, `${prefix}-rotation-mode`, ["linear", "alternate"] as const, defaults.rotationMode),
    opacityPerDepth: number(recipe, `${prefix}-opacity-step`, defaults.opacityPerDepth),
    stackingPerDepth: integer(recipe, `${prefix}-stacking-step`, defaults.stackingPerDepth),
    tonePerDepth: tone(recipe, `${prefix}`, defaults.tonePerDepth),
  };
}

function assertKnownKeys(recipe: SvsRecipe): void {
  const allowed = new Set<string>([
    ...DECK_KEYS,
    ...mediaAppearanceKeys.fit,
    ...mediaAppearanceKeys.sample,
    ...mediaAppearanceKeys.frame,
    ...mediaAppearanceKeys.motion,
  ]);
  const unknown = Object.keys(recipe.properties).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
}

export function decodeDepthStackSpec(recipe: SvsRecipe): DepthStackSpec {
  assertKnownKeys(recipe);
  const motionRecipe = mediaRecipe(recipe, mediaAppearanceKeys.motion);
  const frameRecipe = mediaRecipe(recipe, mediaAppearanceKeys.frame);
  const previousDefaults: DepthStackPoseStep = {
    xPerDepthPx: 0,
    yPerDepthPx: 28,
    scalePerDepth: 0.94,
    rotationPerDepthDeg: -2.5,
    rotationMode: "alternate",
    opacityPerDepth: 0.82,
    stackingPerDepth: -1,
    tonePerDepth: { brightness: 0.92, contrast: 1, saturation: 0.86 },
  };
  const nextDefaults: DepthStackPoseStep = {
    xPerDepthPx: 0,
    yPerDepthPx: -20,
    scalePerDepth: 0.92,
    rotationPerDepthDeg: 2,
    rotationMode: "alternate",
    opacityPerDepth: 0.72,
    stackingPerDepth: -1,
    tonePerDepth: { brightness: 0.88, contrast: 1, saturation: 0.78 },
  };
  return sealDepthStackSpec({

    visibility: {
      previous: integer(recipe, "visible-previous", 2),
      next: integer(recipe, "visible-next", 1),
      wrap: boolean(recipe, "wrap", false),
    },
    poses: {
      current: {
        xPx: number(recipe, "current-x", 0),
        yPx: number(recipe, "current-y", 0),
        scale: number(recipe, "current-scale", 1),
        rotationDeg: number(recipe, "current-rotation", 0),
        opacity: number(recipe, "current-opacity", 1),
        stacking: integer(recipe, "current-stacking", 0),
        tone: tone(recipe, "current", { brightness: 1, contrast: 1, saturation: 1 }),
      },
      previous: step(recipe, "previous", previousDefaults),
      next: step(recipe, "next", nextDefaults),
    },
    reflow: {
      durationFrames: integer(recipe, "reflow-frames", 8),
      easing: oneOf(recipe, "reflow-easing", ["linear", "ease-in", "ease-out", "ease-in-out"] as const, "ease-in-out"),
    },
    presentation: decodeMediaPresentation(frameRecipe),
    motion: decodeMediaMotion(motionRecipe),
    stackingOrder: integer(recipe, "stack-order", 30),
  });
}

export function decodeDepthStackCardSpec(recipe: SvsRecipe, id: string): DepthStackCardSpec {
  assertKnownKeys(recipe);
  return sealDepthStackCardSpec({

    id,
    playback: {
      future: oneOf(recipe, "playback-future", ["hold-head", "continue"] as const, "hold-head"),
      past: oneOf(recipe, "playback-past", ["hold-tail", "continue", "hide"] as const, "hold-tail"),
    },
  });
}

export function decodeDepthStackMaterial(
  recipe: SvsRecipe,
  id: string,
  sourceKind: "still" | "timed" | "surface",
): {
  readonly fit: ContentFit;
  readonly framePaint?: MediaPaintLayerSpec;
  readonly sample: MediaSampleLayerSpec;
} {
  assertKnownKeys(recipe);
  const fitRecipe = mediaRecipe(recipe, mediaAppearanceKeys.fit);
  const sampleRecipe = mediaRecipe(recipe, [...mediaAppearanceKeys.fit, ...mediaAppearanceKeys.sample]);
  const frameRecipe = mediaRecipe(recipe, mediaAppearanceKeys.frame);
  const framePaint = decodeMediaFramePaint(frameRecipe, `${id}:frame-paint`);
  return {
    fit: decodeMediaFit(fitRecipe),
    ...(framePaint === undefined ? {} : { framePaint }),
    sample: decodeMediaSampleSpec(sampleRecipe, `${id}:sample`, sourceKind),
  };
}
