import type { SvsRecipe } from "@narratage/svs";
import { decodeContentFitProperties } from "@narratage/spatial";
import type { ContentFit } from "@narratage/spatial";

import {
  sealMediaPaintLayerSpec,
  sealMediaSampleLayerSpec,
} from "./layers.js";
import { sealMediaItemSpec } from "./program.js";
import { sealMediaHandoffSpec, sealMediaSequenceSpec } from "./sequence.js";
import type {
  MediaFramePresentation,
  MediaHandoffSpec,
  MediaItemSpec,
  MediaLifecycleMotion,
  MediaPaint,
  MediaPaintLayerSpec,
  MediaSampleLayerSpec,
  MediaSequenceSpec,
  MediaVisualOccupancy,
  MediaVisualTrim,
} from "./types.js";

function fail(recipe: SvsRecipe, message: string): never {
  throw new Error(`Media Recipe ${recipe.path} ${message}`);
}

function optionalNumber(recipe: SvsRecipe, name: string): number | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function number(recipe: SvsRecipe, name: string, fallback?: number): number {
  const value = optionalNumber(recipe, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined) fail(recipe, `requires ${name}.`);
  return value;
}

function optionalString(recipe: SvsRecipe, name: string): string | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function string(recipe: SvsRecipe, name: string, fallback?: string): string {
  const value = optionalString(recipe, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined) fail(recipe, `requires ${name}.`);
  return value;
}

function oneOf<T extends string>(recipe: SvsRecipe, name: string, values: readonly T[], fallback?: T): T {
  const value = optionalString(recipe, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined || !values.includes(value as T)) fail(recipe, `${name} must be ${values.join(" | ")}.`);
  return value as T;
}

function assertKeys(recipe: SvsRecipe, allowed: readonly string[]): void {
  const unknown = Object.keys(recipe.properties).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
}

function scalarList(recipe: SvsRecipe, name: string, allowed: readonly number[]): number[] {
  const source = optionalString(recipe, name);
  if (source === undefined) return [];
  const values = source.split(/\s+/u).map(Number);
  if (!allowed.includes(values.length) || values.some((value) => !Number.isFinite(value))) {
    fail(recipe, `${name} requires ${allowed.join(" or ")} finite numbers.`);
  }
  return values;
}

function padding(recipe: SvsRecipe): MediaFramePresentation["padding"] {
  const values = scalarList(recipe, "padding", [1, 2, 4]);
  if (values.length === 0) return { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 };
  if (values.length === 1) return { topPx: values[0]!, rightPx: values[0]!, bottomPx: values[0]!, leftPx: values[0]! };
  if (values.length === 2) return { topPx: values[0]!, rightPx: values[1]!, bottomPx: values[0]!, leftPx: values[1]! };
  return { topPx: values[0]!, rightPx: values[1]!, bottomPx: values[2]!, leftPx: values[3]! };
}

function gradientStops(recipe: SvsRecipe, source: string): readonly { readonly offset: number; readonly color: string }[] {
  const stops = source.split(",").map((entry) => {
    const match = /^(.+?)@((?:0(?:\.\d+)?)|(?:1(?:\.0+)?))$/u.exec(entry.trim());
    if (match === null) fail(recipe, "gradient stops must be color@offset inside [0,1].");
    return { color: match[1]!.trim(), offset: Number(match[2]) };
  });
  if (stops.length < 2) fail(recipe, "gradient requires at least two stops.");
  return stops;
}

function paint(recipe: SvsRecipe, property = "paint"): MediaPaint {
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

function shadows(recipe: SvsRecipe): MediaFramePresentation["shadows"] {
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
const SAMPLE_KEYS = ["opacity", "blur", "brightness", "contrast", "saturation", "playback", "trim-start", "trim-end"] as const;
const FRAME_KEYS = ["stack-order", "clip", "radius", "padding", "border-width", "border-style", "border-color", "shadows", "frame-paint"] as const;
const MOTION_KEYS = ["enter", "enter-frames", "enter-easing", "enter-direction", "enter-amount", "enter-origin", "sustain", "exit", "exit-frames", "exit-easing", "exit-direction", "exit-amount", "exit-origin"] as const;

export function decodeMediaFit(recipe: SvsRecipe): ContentFit {
  return decodeContentFitProperties(recipe.properties, `Media Recipe ${recipe.path}`);
}

function occupancy(recipe: SvsRecipe): MediaVisualOccupancy {
  switch (oneOf(recipe, "playback", ["once-start", "once-end", "hold-start", "hold-end", "loop-start", "loop-end", "stretch"] as const, "once-start")) {
    case "once-start": return { mode: "once", align: "start" };
    case "once-end": return { mode: "once", align: "end" };
    case "hold-start": return { mode: "hold", align: "start" };
    case "hold-end": return { mode: "hold", align: "end" };
    case "loop-start": return { mode: "loop", align: "start" };
    case "loop-end": return { mode: "loop", align: "end" };
    case "stretch": return { mode: "stretch" };
  }
}

function trim(recipe: SvsRecipe): MediaVisualTrim | undefined {
  const startFrame = optionalNumber(recipe, "trim-start");
  const endFrameExclusive = optionalNumber(recipe, "trim-end");
  if (startFrame === undefined && endFrameExclusive === undefined) return undefined;
  if (
    startFrame === undefined
    || endFrameExclusive === undefined
    || !Number.isSafeInteger(startFrame)
    || !Number.isSafeInteger(endFrameExclusive)
  ) {
    fail(recipe, "trim-start and trim-end must both be integer frames.");
  }
  return { startFrame, endFrameExclusive };
}

export function decodeMediaSampleSpec(
  recipe: SvsRecipe,
  id: string,
  sourceKind: "still" | "timed" | "surface",
  samplingMotion?: MediaSampleLayerSpec["samplingMotion"],
  combinedItemAppearance = false,
): MediaSampleLayerSpec {
  assertKeys(recipe, [...FIT_KEYS, ...SAMPLE_KEYS, ...(combinedItemAppearance ? FRAME_KEYS : [])]);
  const hasTimedProperties = recipe.properties.playback !== undefined
    || recipe.properties["trim-start"] !== undefined
    || recipe.properties["trim-end"] !== undefined;
  if (sourceKind === "still" && hasTimedProperties) {
    fail(recipe, "cannot apply playback or trim to durationless still material.");
  }
  const timed = sourceKind === "timed" || (sourceKind === "surface" && hasTimedProperties);
  const sourceTrim = timed ? trim(recipe) : undefined;
  return sealMediaSampleLayerSpec({
    contract: "svml.media-sample-layer-spec@1",
    id,
    ...(timed ? { occupancy: occupancy(recipe), ...(sourceTrim === undefined ? {} : { trim: sourceTrim }) } : {}),
    appearance: {
      opacity: number(recipe, "opacity", 1),
      filter: {
        blurPx: number(recipe, "blur", 0), brightness: number(recipe, "brightness", 1),
        contrast: number(recipe, "contrast", 1), saturation: number(recipe, "saturation", 1),
      },
    },
    ...(samplingMotion === undefined ? {} : { samplingMotion }),
  });
}

function edge(recipe: SvsRecipe, prefix: "enter" | "exit"): MediaLifecycleMotion["enter"] {
  const operator = optionalString(recipe, prefix);
  if (operator === undefined || operator === "none") return undefined;
  const allowed = ["fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"] as const;
  if (!allowed.includes(operator as typeof allowed[number])) fail(recipe, `${prefix} operator is invalid.`);
  const direction = optionalString(recipe, `${prefix}-direction`);
  const origin = optionalString(recipe, `${prefix}-origin`);
  return {
    operator: operator as typeof allowed[number],
    durationFrames: number(recipe, `${prefix}-frames`),
    easing: oneOf(recipe, `${prefix}-easing`, ["linear", "ease-in", "ease-out", "ease-in-out"] as const, "ease-in-out"),
    ...(direction === undefined ? {} : { direction: oneOf(recipe, `${prefix}-direction`, ["left", "right", "up", "down"] as const) }),
    ...(origin === undefined ? {} : { origin: oneOf(recipe, `${prefix}-origin`, ["outside-canvas"] as const) }),
    ...(optionalNumber(recipe, `${prefix}-amount`) === undefined ? {} : { amount: number(recipe, `${prefix}-amount`) }),
  };
}

function sustain(recipe: SvsRecipe): MediaLifecycleMotion["sustain"] {
  const source = optionalString(recipe, "sustain");
  if (source === undefined || source === "none") return [];
  return source.split(",").map((entry) => {
    const match = /^(float|breathe|pulse|wobble|shake|drift)\s+([-+]?\d+(?:\.\d+)?)\s+([1-9]\d*)(?:\s+(left|right|up|down))?$/u.exec(entry.trim());
    if (match === null) fail(recipe, "sustain entries require operator amount cycles [direction].");
    return {
      operator: match[1] as MediaLifecycleMotion["sustain"][number]["operator"],
      amount: Number(match[2]), cycles: Number(match[3]),
      ...(match[4] === undefined ? {} : { direction: match[4] as "left" | "right" | "up" | "down" }),
    };
  });
}

export function decodeMediaMotion(recipe: SvsRecipe | undefined): MediaLifecycleMotion {
  if (recipe === undefined) return { sustain: [] };
  assertKeys(recipe, MOTION_KEYS);
  const enter = edge(recipe, "enter");
  const exit = edge(recipe, "exit");
  return {
    ...(enter === undefined ? {} : { enter }),
    sustain: sustain(recipe),
    ...(exit === undefined ? {} : { exit }),
  };
}

export function decodeMediaPresentation(recipe: SvsRecipe): MediaFramePresentation {
  const clip = oneOf(recipe, "clip", ["none", "frame", "rounded"] as const, "frame");
  const borderWidth = number(recipe, "border-width", 0);
  return {
    clip: clip === "rounded" ? { kind: "rounded", radiusPx: number(recipe, "radius", 0) } : { kind: clip },
    padding: padding(recipe),
    ...(borderWidth === 0 ? {} : { border: {
      widthPx: borderWidth,
      style: oneOf(recipe, "border-style", ["solid", "dashed", "dotted"] as const, "solid"),
      color: string(recipe, "border-color"),
    } }),
    shadows: shadows(recipe),
  };
}

export function decodeMediaItemSpec(
  recipe: SvsRecipe,
  input: Pick<MediaItemSpec, "id" | "projection" | "expansion"> & {
    readonly motion: MediaLifecycleMotion;
    readonly sourceAudio?: MediaItemSpec["sourceAudio"];
  },
): MediaItemSpec {
  assertKeys(recipe, [...FIT_KEYS, ...SAMPLE_KEYS, ...FRAME_KEYS]);
  return sealMediaItemSpec({
    contract: "svml.media-item-spec@1",
    id: input.id,
    projection: input.projection,
    expansion: input.expansion,
    presentation: decodeMediaPresentation(recipe),
    motion: input.motion,
    stackingOrder: number(recipe, "stack-order"),
    ...(input.sourceAudio === undefined ? {} : { sourceAudio: input.sourceAudio }),
  });
}

export function decodeMediaFramePaint(recipe: SvsRecipe, id: string): MediaPaintLayerSpec | undefined {
  const source = optionalString(recipe, "frame-paint");
  if (source === undefined || source === "transparent") return undefined;
  const adapted: SvsRecipe = { ...recipe, properties: { paint: source } };
  return sealMediaPaintLayerSpec({ contract: "svml.media-paint-layer-spec@1", id, paint: paint(adapted), opacity: 1 });
}

export function decodeMediaPaintSpec(recipe: SvsRecipe, id: string): MediaPaintLayerSpec {
  assertKeys(recipe, ["paint", "opacity"]);
  return sealMediaPaintLayerSpec({
    contract: "svml.media-paint-layer-spec@1", id, paint: paint(recipe), opacity: number(recipe, "opacity", 1),
  });
}

export function decodeMediaHandoffSpec(
  recipe: SvsRecipe,
  id: string,
  fromMemberId: string,
  toMemberId: string,
): MediaHandoffSpec {
  assertKeys(recipe, ["operator", "duration-frames", "boundary-ratio", "direction", "audio"]);
  const operator = oneOf(recipe, "operator", ["cut", "crossfade", "push", "wipe", "cover", "page-turn"] as const);
  const direction = optionalString(recipe, "direction");
  return sealMediaHandoffSpec({
    contract: "svml.media-handoff-spec@1", id, fromMemberId, toMemberId, operator,
    durationFrames: number(recipe, "duration-frames"),
    boundaryRatio: number(recipe, "boundary-ratio", 0.5),
    ...(direction === undefined ? {} : { direction: oneOf(recipe, "direction", ["left", "right", "up", "down"] as const) }),
    audio: oneOf(recipe, "audio", ["cut", "crossfade"] as const, "cut"),
  });
}

export function decodeMediaSequenceSpec(
  recipe: SvsRecipe,
  id: string,
  motion: MediaLifecycleMotion,
  handoffs: readonly MediaHandoffSpec[],
): MediaSequenceSpec {
  assertKeys(recipe, [...FIT_KEYS, ...SAMPLE_KEYS, ...FRAME_KEYS]);
  return sealMediaSequenceSpec({
    contract: "svml.media-sequence-spec@1", id,
    presentation: decodeMediaPresentation(recipe), motion,
    stackingOrder: number(recipe, "stack-order"), handoffs,
  });
}

export const mediaAppearanceKeys = { fit: FIT_KEYS, sample: SAMPLE_KEYS, frame: FRAME_KEYS, motion: MOTION_KEYS } as const;
