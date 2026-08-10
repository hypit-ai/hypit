import type { ValueSchema } from "@narratage/protocol";

import { depthStackRecipeKeys } from "./author.js";

/**
 * The properties an author writes in a DepthStack Recipe.
 *
 * The three decoders decide what a Recipe may contain the way a decoder does:
 * one reader call per property, its type implied by which reader was called.
 * That compiles a stylesheet and lets nothing else offer one, so the same facts
 * are stated here as data.
 *
 * Which properties exist is not restated — `depthStackRecipeKeys` is the list
 * the decoders already refuse anything outside of, so a property added there
 * appears here without anyone remembering to. The groups below only say what
 * each one is, and a property belonging to none of them fails at load rather
 * than quietly becoming untypeable.
 */

/** Both neighbours take the same per-depth step, so each name yields two. */
const perDepth = (...names: readonly string[]): readonly string[] =>
  names.flatMap((name) => [`previous-${name}`, `next-${name}`]);

/** Both edges of a lifecycle take the same controls, so each name yields two. */
const perEdge = (...names: readonly string[]): readonly string[] =>
  names.flatMap((name) => [`enter-${name}`, `exit-${name}`]);

const COLORS = ["border-color"];

/** A fraction of the frame, or of full opacity. */
const UNIT_FRACTIONS = [
  "current-opacity", ...perDepth("opacity-step"),
  "opacity", "frame-x", "frame-y", "content-x", "content-y",
];

/** Counted in frames or in Cards, so never below none of them. */
const COUNTS = ["visible-previous", "visible-next", "reflow-frames", "trim-start", "trim-end"];

/** An edge that runs over no frames at all is refused, so these start at one. */
const POSITIVE_COUNTS = perEdge("frames");

/** Painter's order, which a Card may take below the rest of the composition. */
const INTEGERS = ["current-stacking", ...perDepth("stacking-step"), "stack-order"];

/**
 * Scale and tone multiply once per step of depth and a filter cannot subtract
 * below nothing, so each of these has its floor at zero. The seals want scale
 * and tone strictly above it, which a schema has no way to say.
 */
const NON_NEGATIVE_NUMBERS = [
  "current-scale", "current-brightness", "current-contrast", "current-saturation",
  ...perDepth("scale-step", "brightness-step", "contrast-step", "saturation-step"),
  "blur", "brightness", "contrast", "saturation", "radius", "border-width",
];

const NUMBERS = [
  "current-x", "current-y", "current-rotation",
  ...perDepth("x-step", "y-step", "rotation-step"),
  "fit-offset-x", "fit-offset-y", ...perEdge("amount"),
];

const BOOLEANS = ["wrap"];

/**
 * Each of these is a small syntax of its own: pixel counts CSS-style, or
 * entries joined by a separator. The decoder names the shape it wanted when it
 * refuses one, so nothing is gained by half-stating it here.
 */
const STRINGS = ["padding", "shadows", "frame-paint", "sustain"];

const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"];

/** Every one-shot lifecycle operator, shared by the enter and exit edges. */
const EDGE_OPERATORS = [
  "none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin",
];

const DIRECTIONS = ["left", "right", "up", "down"];

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  "previous-rotation-mode": ["linear", "alternate"],
  "next-rotation-mode": ["linear", "alternate"],
  "reflow-easing": EASINGS,
  "playback-future": ["hold-head", "continue"],
  "playback-past": ["hold-tail", "continue", "hide"],
  "fit": ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"],
  "fit-constraint": ["bounded", "free"],
  "playback": ["once-start", "once-end", "hold-start", "hold-end", "loop-start", "loop-end", "stretch"],
  "clip": ["none", "frame", "rounded"],
  "border-style": ["solid", "dashed", "dotted"],
  "enter": EDGE_OPERATORS,
  "exit": EDGE_OPERATORS,
  "enter-easing": EASINGS,
  "exit-easing": EASINGS,
  "enter-direction": DIRECTIONS,
  "exit-direction": DIRECTIONS,
  "enter-origin": ["outside-canvas"],
  "exit-origin": ["outside-canvas"],
};

/** What each group means, resolved per property. */
function schemaFor(name: string): ValueSchema | undefined {
  if (COLORS.includes(name)) return { kind: "string", format: "color" };
  if (UNIT_FRACTIONS.includes(name)) {
    return { kind: "number", format: "unit-fraction", minimum: 0, maximum: 1 };
  }
  if (COUNTS.includes(name)) return { kind: "number", integer: true, minimum: 0 };
  if (POSITIVE_COUNTS.includes(name)) return { kind: "number", integer: true, minimum: 1 };
  if (INTEGERS.includes(name)) return { kind: "number", integer: true };
  if (NON_NEGATIVE_NUMBERS.includes(name)) return { kind: "number", minimum: 0 };
  if (NUMBERS.includes(name)) return { kind: "number" };
  if (BOOLEANS.includes(name)) return { kind: "boolean" };
  if (STRINGS.includes(name)) return { kind: "string" };
  const values = ENUMS[name];
  return values === undefined ? undefined : { kind: "string", enum: values };
}

/**
 * Every property stands alone, because every reader has a fallback: a Recipe
 * may be as short as an author likes. The two exceptions are conditional and so
 * unstateable here — a border demands its colour once it has width, and an edge
 * operator demands the frames it runs over — and the decoder asks for those in
 * its own words at the moment they become necessary.
 */
function fields(): Record<string, { schema: ValueSchema; optional: true }> {
  const built: Record<string, { schema: ValueSchema; optional: true }> = {};
  for (const name of depthStackRecipeKeys) {
    const schema = schemaFor(name);
    if (schema === undefined) {
      throw new Error(`DepthStack Recipe property ${name} has no declared type`);
    }
    built[name] = { schema, optional: true };
  }
  return built;
}

export const depthStackRecipeSchema: ValueSchema = { kind: "object", fields: fields() };

/** Every property name the schema states, for callers that need the set. */
export const depthStackRecipeProperties: readonly string[] =
  Object.keys((depthStackRecipeSchema as { fields: object }).fields).sort();
