import type { ValueSchema } from "@narratage/protocol";

import { mediaAppearanceKeys } from "./author.js";

/**
 * The properties an author writes in a Media Recipe.
 *
 * The decoders in `author.ts` already decide what a Recipe may contain, and
 * they decide it twice over: `assertKeys` refuses a name outside the group
 * lists, and a reader call per property implies its type. That is enough to
 * compile a stylesheet and not enough for anything else to offer one, so the
 * same facts are stated here as data.
 *
 * Which properties exist is not restated — it is taken from `mediaAppearanceKeys`,
 * so a property added to a decoder appears here without anyone remembering to.
 * The groups below only say what each one is, and a property belonging to none
 * of them fails at load rather than quietly becoming untypeable.
 *
 * There are two schemas because there are two Recipes. `assertKeys` makes the
 * appearance vocabulary and the motion vocabulary reject each other outright,
 * and a stylesheet writes them under two prefixes, so a single merged schema
 * would describe a Recipe that no Surface would accept.
 */

/** Both edges of a lifecycle carry the same motion properties, so each name yields two. */
const paired = (...suffixes: readonly string[]): readonly string[] =>
  suffixes.flatMap((suffix) => [`enter${suffix}`, `exit${suffix}`]);

/** A fraction of the frame, or of full opacity. */
const UNIT_FRACTIONS = ["frame-x", "frame-y", "content-x", "content-y", "opacity"];

/** Pixel counts that cannot be negative, and frame counts that cannot either. */
const UNSIGNED = ["blur", "brightness", "contrast", "saturation", "radius", "border-width"];

const FRAMES = ["trim-start", "trim-end"];

const INTEGERS = ["stack-order"];

const NUMBERS = ["fit-offset-x", "fit-offset-y", ...paired("-amount")];

const POSITIVE_FRAMES = paired("-frames");

const COLORS = ["border-color"];

/** Grammars of their own, read by the decoder rather than matched by a form. */
const STRINGS = ["padding", "shadows", "frame-paint", "sustain"];

const DIRECTIONS = ["left", "right", "up", "down"];
const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"];

/** `none` is how a Recipe says an edge does nothing, so it belongs to the operators. */
const EDGE_OPERATORS = [
  "none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin",
];

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  "fit": ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"],
  "fit-constraint": ["bounded", "free"],
  "playback": ["once-start", "once-end", "hold-start", "hold-end", "loop-start", "loop-end", "stretch"],
  // A Path clip arrives through `clip={Path}`, which is why no Recipe can name one.
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

const REQUIRED = new Set<string>(mediaAppearanceKeys.required);

/** What each group means, resolved per property. */
function schemaFor(name: string): ValueSchema | undefined {
  if (UNIT_FRACTIONS.includes(name)) {
    return { kind: "number", format: "unit-fraction", minimum: 0, maximum: 1 };
  }
  if (UNSIGNED.includes(name)) return { kind: "number", minimum: 0 };
  if (FRAMES.includes(name)) return { kind: "number", integer: true, minimum: 0 };
  if (POSITIVE_FRAMES.includes(name)) return { kind: "number", integer: true, minimum: 1 };
  if (INTEGERS.includes(name)) return { kind: "number", integer: true };
  if (NUMBERS.includes(name)) return { kind: "number" };
  if (COLORS.includes(name)) return { kind: "string", format: "color" };
  if (STRINGS.includes(name)) return { kind: "string" };
  const values = ENUMS[name];
  return values === undefined ? undefined : { kind: "string", enum: values };
}

function fields(names: readonly string[]): Record<string, { schema: ValueSchema; optional?: true }> {
  const built: Record<string, { schema: ValueSchema; optional?: true }> = {};
  for (const name of names) {
    const schema = schemaFor(name);
    if (schema === undefined) throw new Error(`Media Recipe property ${name} has no declared type`);
    built[name] = REQUIRED.has(name) ? { schema } : { schema, optional: true };
  }
  return built;
}

const properties = (schema: ValueSchema): readonly string[] =>
  Object.keys((schema as { fields: object }).fields).sort();

export const mediaAppearanceRecipeSchema: ValueSchema = {
  kind: "object",
  fields: fields([...mediaAppearanceKeys.fit, ...mediaAppearanceKeys.sample, ...mediaAppearanceKeys.frame]),
};

export const mediaMotionRecipeSchema: ValueSchema = {
  kind: "object",
  fields: fields(mediaAppearanceKeys.motion),
};

/** Every property name each schema states, for callers that need the set. */
export const mediaAppearanceRecipeProperties = properties(mediaAppearanceRecipeSchema);
export const mediaMotionRecipeProperties = properties(mediaMotionRecipeSchema);
