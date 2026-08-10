import type { ValueSchema } from "@narratage/protocol";

import { OPTIONAL_PROPERTIES, REQUIRED_PROPERTIES } from "./style.js";

/**
 * The properties an author writes in a Fine Caption Recipe.
 *
 * `fineCaptionParameters` is the only thing that decides what a Recipe may
 * contain, and it decides it in the shape of control flow: a reader call per
 * property, its type implied by which reader was called. That is enough to
 * compile a stylesheet and not enough for anything else to offer one, so the
 * same facts are stated here as data.
 *
 * Which properties exist is not restated — it is taken from the reader's own
 * lists, so a property added there appears here without anyone remembering to.
 * The groups below only say what each one is, and a property belonging to none
 * of them fails at load rather than quietly becoming untypeable.
 */

/** Both Paints carry the same glyph properties, so each name yields two. */
const paired = (...names: readonly string[]): readonly string[] =>
  names.flatMap((name) => [name, `active-${name}`]);

const COLORS = [
  ...paired("fill", "glow-color", "gradient-from", "gradient-to", "long-shadow-color",
    "shadow-color", "stroke-color"),
  "background", "border-color", "underline-color",
  "active-box-background", "active-box-border-color", "active-underline-color",
];

/** A fraction of the frame, or of full opacity. */
const UNIT_FRACTIONS = [
  "x", "y", "width",
  ...paired("opacity", "glow-opacity", "long-shadow-opacity", "shadow-opacity"),
];

const INTEGERS = [
  "cue-min-words", "cue-max-words", "stack-order", "weight",
  "active-box-transition-frames", "active-response-frames",
  "atom-enter-frames", "atom-exit-frames", "cue-enter-frames", "cue-exit-frames",
  "loop-period-frames",
];

const NUMBERS = [
  "size", "radius", "line-height", "border-width", "letter-spacing", "loop-intensity",
  "slide-distance", "word-gap", "active-box-border-width", "active-box-radius", "active-scale",
  "underline-offset", "underline-thickness", "active-underline-offset", "active-underline-thickness",
  ...paired("glow-blur", "gradient-angle", "long-shadow-angle", "long-shadow-distance",
    "shadow-blur", "shadow-x", "shadow-y", "stroke-width"),
];

/** One or two pixel counts, CSS-style. */
const STRINGS = ["font", "padding", "active-box-padding"];

/** Every one-shot motion operator, shared by the cue, atom, box and response axes. */
const MOTIONS = [
  "none", "fade", "pop", "scale", "spring", "bounce", "elastic", "stamp", "tilt", "zoom-blur",
  "flip-x", "flip-y", "spin", "squash", "stretch", "slide-left", "slide-right", "slide-up", "slide-down",
  "blur-in", "wipe-left", "wipe-right", "wipe-up", "wipe-down",
];

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  "align": ["left", "center", "right"],
  "anchor-x": ["left", "center", "right"],
  "anchor-y": ["top", "center", "bottom"],
  "direction": ["ltr", "rtl"],
  "font-style": ["normal", "italic", "oblique"],
  "text-transform": ["none", "uppercase", "lowercase"],
  "atom-reveal": ["all", "on-start", "typewriter"],
  "karaoke": ["off", "current", "trail"],
  "karaoke-transition": ["step", "wipe"],
  "underline": ["off", "always"],
  "active-underline": ["off", "current", "trail"],
  "active-box": ["off", "current", "trail"],
  "active-box-continuity": ["isolated", "joined"],
  "loop": ["none", "shake", "wobble", "glow-pulse", "breathe", "float", "pulse", "flicker"],
  "loop-target": ["cue", "active-atom"],
  "cue-enter": MOTIONS,
  "cue-exit": MOTIONS,
  "atom-enter": MOTIONS,
  "atom-exit": MOTIONS,
  "active-box-enter": MOTIONS,
  "active-box-exit": MOTIONS,
  "active-response": MOTIONS,
};

const REQUIRED = new Set<string>(REQUIRED_PROPERTIES);

/** What each group means, resolved per property. */
function schemaFor(name: string): ValueSchema | undefined {
  if (COLORS.includes(name)) return { kind: "string", format: "color" };
  if (UNIT_FRACTIONS.includes(name)) {
    return { kind: "number", format: "unit-fraction", minimum: 0, maximum: 1 };
  }
  if (INTEGERS.includes(name)) return { kind: "number", integer: true };
  if (NUMBERS.includes(name)) return { kind: "number" };
  if (STRINGS.includes(name)) return { kind: "string" };
  const values = ENUMS[name];
  return values === undefined ? undefined : { kind: "string", enum: values };
}

function fields(): Record<string, { schema: ValueSchema; optional?: true }> {
  const built: Record<string, { schema: ValueSchema; optional?: true }> = {};
  for (const name of [...REQUIRED_PROPERTIES, ...OPTIONAL_PROPERTIES]) {
    const schema = schemaFor(name);
    if (schema === undefined) {
      throw new Error(`Fine Caption Recipe property ${name} has no declared type`);
    }
    built[name] = REQUIRED.has(name) ? { schema } : { schema, optional: true };
  }
  return built;
}

export const fineCaptionRecipeSchema: ValueSchema = { kind: "object", fields: fields() };

/** Every property name the schema states, for callers that need the set. */
export const fineCaptionRecipeProperties: readonly string[] =
  Object.keys((fineCaptionRecipeSchema as { fields: object }).fields).sort();
