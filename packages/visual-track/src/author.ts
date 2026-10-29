import type { Recipe } from "@hypit/hypit/recipe";
import { decodeContentFitProperties } from "@hypit/spatial";
import type { ContentFit } from "@hypit/spatial";

import {
  sealMediaPaintLayerSpec,
  sealMediaSampleLayerSpec,
} from "./layers.js";
import { sealVisualClipSpec } from "./program.js";
import type {
  VisualFrameTreatment,
  VisualClipSpec,
  MediaPaint,
  MediaPaintLayerSpec,
  MediaSampleLayerSpec,
  MediaSampleAppearance,
  VisualSourceTimeSpec,
} from "./types.js";

function fail(recipe: Recipe, message: string): never {
  throw new Error(`Media Recipe ${recipe.path} ${message}`);
}

function optionalNumber(recipe: Recipe, name: string): number | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function number(recipe: Recipe, name: string, fallback?: number): number {
  const value = optionalNumber(recipe, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined) fail(recipe, `requires ${name}.`);
  return value;
}

function optionalString(recipe: Recipe, name: string): string | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function string(recipe: Recipe, name: string, fallback?: string): string {
  const value = optionalString(recipe, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined) fail(recipe, `requires ${name}.`);
  return value;
}

function oneOf<T extends string>(recipe: Recipe, name: string, values: readonly T[], fallback?: T): T {
  const value = optionalString(recipe, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined || !values.includes(value as T)) fail(recipe, `${name} must be ${values.join(" | ")}.`);
  return value as T;
}

function assertKeys(recipe: Recipe, allowed: readonly string[]): void {
  const unknown = Object.keys(recipe.properties).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
}

function scalarList(recipe: Recipe, name: string, allowed: readonly number[]): number[] {
  const source = optionalString(recipe, name);
  if (source === undefined) return [];
  const values = source.split(/\s+/u).map(Number);
  if (!allowed.includes(values.length) || values.some((value) => !Number.isFinite(value))) {
    fail(recipe, `${name} requires ${allowed.join(" or ")} finite numbers.`);
  }
  return values;
}

function padding(recipe: Recipe): VisualFrameTreatment["padding"] {
  const values = scalarList(recipe, "padding", [1, 2, 4]);
  if (values.length === 0) return { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 };
  if (values.length === 1) return { topPx: values[0]!, rightPx: values[0]!, bottomPx: values[0]!, leftPx: values[0]! };
  if (values.length === 2) return { topPx: values[0]!, rightPx: values[1]!, bottomPx: values[0]!, leftPx: values[1]! };
  return { topPx: values[0]!, rightPx: values[1]!, bottomPx: values[2]!, leftPx: values[3]! };
}

function gradientStops(recipe: Recipe, source: string): readonly { readonly offset: number; readonly color: string }[] {
  // Split on commas between stops, not those inside a functional color such as rgba(0,0,0,0.5).
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") depth -= 1;
    else if (source[index] === "," && depth === 0) {
      entries.push(source.slice(start, index));
      start = index + 1;
    }
  }
  entries.push(source.slice(start));
  const stops = entries.map((entry) => {
    const match = /^(.+?)@((?:0(?:\.\d+)?)|(?:1(?:\.0+)?))$/u.exec(entry.trim());
    if (match === null) fail(recipe, "gradient stops must be color@offset inside [0,1].");
    return { color: match[1]!.trim(), offset: Number(match[2]) };
  });
  if (stops.length < 2) fail(recipe, "gradient requires at least two stops.");
  return stops;
}

function paint(recipe: Recipe, property = "paint"): MediaPaint {
  const source = string(recipe, property);
  const linear = /^linear\(([-+]?\d+(?:\.\d+)?);(.+)\)$/u.exec(source);
  if (linear !== null) {
    return { kind: "linear-gradient", angleDeg: Number(linear[1]), stops: gradientStops(recipe, linear[2]!) };
  }
  const radial = /^radial\(((?:0(?:\.\d+)?)|(?:1(?:\.0+)?)),((?:0(?:\.\d+)?)|(?:1(?:\.0+)?));(.+)\)$/u.exec(source);
  if (radial !== null) {
    return { kind: "radial-gradient", center: { x: Number(radial[1]), y: Number(radial[2]) }, stops: gradientStops(recipe, radial[3]!) };
  }
  return { kind: "solid", color: source };
}

function shadows(recipe: Recipe): VisualFrameTreatment["shadows"] {
  const source = optionalString(recipe, "shadows");
  if (source === undefined || source === "none") return [];
  return source.split(";").map((entry) => {
    const match = /^([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s+(.+)$/u.exec(entry.trim());
    if (match === null) fail(recipe, "shadows entries require x y blur spread color.");
    return {
      offsetX: Number(match[1]), offsetY: Number(match[2]), blurPx: Number(match[3]),
      spreadPx: Number(match[4]), color: match[5]!.trim(),
    };
  });
}

const FIT_KEYS = ["fit", "frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y", "fit-constraint"] as const;
const SAMPLE_KEYS = ["opacity", "blur", "brightness", "contrast", "saturation"] as const;
const FRAME_KEYS = ["clip", "radius", "padding", "border-width", "border-style", "border-color", "shadows", "frame-paint"] as const;

export function decodeMediaFit(recipe: Recipe): ContentFit {
  return decodeContentFitProperties(recipe.properties, `Media Recipe ${recipe.path}`);
}

export function decodeMediaSampleSpec(
  recipe: Recipe,
  id: string,
  sourceKind: "still" | "timed" | "surface",
  samplingMotion?: MediaSampleLayerSpec["samplingMotion"],
  combinedClipAppearance = false,
  sourceTime?: VisualSourceTimeSpec,
): MediaSampleLayerSpec {
  assertKeys(recipe, [...FIT_KEYS, ...SAMPLE_KEYS, ...(combinedClipAppearance ? FRAME_KEYS : [])]);
  if (sourceKind === "still" && sourceTime !== undefined) fail(recipe, "cannot apply source time to a still picture.");
  return sealMediaSampleLayerSpec({
    id,
    ...(sourceTime === undefined ? {} : { sourceTime }),
    appearance: decodeMediaSampleAppearance(recipe),
    ...(samplingMotion === undefined ? {} : { samplingMotion }),
  });
}

/** Decode visual-only sample styling without choosing playback or source trim. */
/** Public authored defaults shared by decoding and optional editor fields. */
export const visualTreatmentDefaults = {
  opacity: 1, blur: 0, brightness: 1, contrast: 1, saturation: 1,
  clip: "frame", radius: 0,
} as const;

export function decodeMediaSampleAppearance(recipe: Recipe): MediaSampleAppearance {
  return {
    opacity: number(recipe, "opacity", visualTreatmentDefaults.opacity),
    filter: {
      blurPx: number(recipe, "blur", visualTreatmentDefaults.blur), brightness: number(recipe, "brightness", visualTreatmentDefaults.brightness),
      contrast: number(recipe, "contrast", visualTreatmentDefaults.contrast), saturation: number(recipe, "saturation", visualTreatmentDefaults.saturation),
    },
  };
}

export function decodeVisualFrameTreatment(recipe: Recipe): VisualFrameTreatment {
  const clip = oneOf(recipe, "clip", ["none", "frame", "rounded"] as const, visualTreatmentDefaults.clip);
  const borderWidth = number(recipe, "border-width", 0);
  return {
    clip: clip === "rounded" ? { kind: "rounded", radiusPx: number(recipe, "radius", visualTreatmentDefaults.radius) } : { kind: clip },
    padding: padding(recipe),
    ...(borderWidth === 0 ? {} : { border: {
      widthPx: borderWidth,
      style: oneOf(recipe, "border-style", ["solid", "dashed", "dotted"] as const, "solid"),
      color: string(recipe, "border-color"),
    } }),
    shadows: shadows(recipe),
  };
}

export function decodeVisualClipSpec(
  recipe: Recipe,
  input: Pick<VisualClipSpec, "id" | "motion" | "z">,
): VisualClipSpec {
  assertKeys(recipe, [...SAMPLE_KEYS, ...FRAME_KEYS]);
  return sealVisualClipSpec({

    id: input.id,
    treatment: decodeVisualFrameTreatment(recipe),
    ...(input.motion === undefined ? {} : { motion: input.motion }),
    z: input.z,
  });
}

export function decodeMediaFramePaint(recipe: Recipe, id: string): MediaPaintLayerSpec | undefined {
  const source = optionalString(recipe, "frame-paint");
  if (source === undefined || source === "transparent") return undefined;
  const adapted: Recipe = { ...recipe, properties: { paint: source } };
  return sealMediaPaintLayerSpec({ id, paint: paint(adapted), opacity: 1 });
}

export function decodeMediaPaintSpec(recipe: Recipe, id: string): MediaPaintLayerSpec {
  assertKeys(recipe, ["paint", "opacity"]);
  return sealMediaPaintLayerSpec({
    id, paint: paint(recipe), opacity: number(recipe, "opacity", visualTreatmentDefaults.opacity),
  });
}

export const visualMaterialKeys = { fit: FIT_KEYS, sample: SAMPLE_KEYS, frame: FRAME_KEYS } as const;
