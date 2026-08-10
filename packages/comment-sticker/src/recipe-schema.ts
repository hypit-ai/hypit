import type { ValueSchema } from "@narratage/protocol";

import { STYLE_PROPERTIES } from "./author.js";

/**
 * The properties an author writes in a Comment Sticker Recipe.
 *
 * `decodeCommentStickerStyle` is the only thing that decides what a Recipe may
 * contain, and it decides it in the shape of control flow: a reader call per
 * property, its type implied by which reader was called. That is enough to
 * compile a stylesheet and not enough for anything else to offer one, so the
 * same facts are stated here as data.
 *
 * Which properties exist is not restated — it is taken from the decoder's own
 * list, so a property added there appears here without anyone remembering to.
 * The groups below only say what each one is, and a property belonging to none
 * of them fails at load rather than quietly becoming untypeable.
 *
 * The bounds are the seal's, not the reader's: `decodeCommentStickerStyle` takes
 * any finite number and `assertCommentStickerStyle` is what refuses a negative
 * radius, so that is where a bound worth offering an author comes from.
 */

/** The decoder builds header, body and meta from one template, so each name yields three. */
const roles = (...names: readonly string[]): readonly string[] =>
  names.flatMap((name) => ["header", "body", "meta"].map((role) => `${role}-${name}`));

const COLORS = [
  "background", "border-color", "shadow-color",
  "avatar-border-color", "avatar-background", "avatar-text-color",
  ...roles("color"),
];

/** Whether the card grows a speech tail; the only property that is neither a number nor a word. */
const BOOLEANS = ["tail"];

/** A layer, which may sit behind everything as readily as in front. */
const UNBOUNDED_INTEGERS = ["stack-order"];

/** A duration, which may be no frames at all. */
const FRAME_COUNTS = ["enter-frames", "exit-frames"];

/** A count of something there has to be one of before it means anything. */
const AT_LEAST_ONE = ["body-max-lines", "hold-period-frames"];

/** A CSS font weight, which a face may or may not have. */
const WEIGHTS = roles("weight");

/**
 * A length, an amplitude or a scale.
 *
 * Some of these the seal holds above zero rather than at it, but a ValueSchema
 * states an inclusive bound only, so the stricter ones are offered as the bound
 * it can hold and the seal goes on refusing a sticker of no size in its own
 * words.
 */
const NON_NEGATIVE = [
  "border-width", "radius", "padding-x", "padding-y", "gap",
  "shadow-blur", "tail-width", "tail-height", "tail-offset-x",
  "avatar-size", "avatar-border-width",
  "enter-start-scale", "hold-amplitude-y", "hold-rotation-amplitude",
  ...roles("size", "line-height"),
];

/** Offsets and rotations, whose defaults are themselves negative. */
const SIGNED = [
  "rotation", "shadow-x", "shadow-y", "shadow-spread",
  "enter-offset-y", "enter-rotation-delta", "exit-offset-y",
];

/** Both one-shot axes ease the same way. */
const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"];

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  "avatar-fallback": ["none", "initial"],
  "enter": ["none", "fade", "pop", "slide-pop"],
  "enter-easing": EASINGS,
  "exit": ["none", "fade", "fade-up"],
  "exit-easing": EASINGS,
  "hold": ["none", "float"],
};

/** What each group means, resolved per property. */
function schemaFor(name: string): ValueSchema | undefined {
  if (COLORS.includes(name)) return { kind: "string", format: "color" };
  if (BOOLEANS.includes(name)) return { kind: "boolean" };
  if (UNBOUNDED_INTEGERS.includes(name)) return { kind: "number", integer: true };
  if (FRAME_COUNTS.includes(name)) return { kind: "number", integer: true, minimum: 0 };
  if (AT_LEAST_ONE.includes(name)) return { kind: "number", integer: true, minimum: 1 };
  if (WEIGHTS.includes(name)) return { kind: "number", integer: true, minimum: 1, maximum: 1_000 };
  if (NON_NEGATIVE.includes(name)) return { kind: "number", minimum: 0 };
  if (SIGNED.includes(name)) return { kind: "number" };
  const values = ENUMS[name];
  return values === undefined ? undefined : { kind: "string", enum: values };
}

/** The decoder answers every property with a fallback, so a Recipe may state as few as none. */
function fields(): Record<string, { schema: ValueSchema; optional: true }> {
  const built: Record<string, { schema: ValueSchema; optional: true }> = {};
  for (const name of STYLE_PROPERTIES) {
    const schema = schemaFor(name);
    if (schema === undefined) {
      throw new Error(`Comment Sticker Recipe property ${name} has no declared type`);
    }
    built[name] = { schema, optional: true };
  }
  return built;
}

export const commentStickerRecipeSchema: ValueSchema = { kind: "object", fields: fields() };

/** Every property name the schema states, for callers that need the set. */
export const commentStickerRecipeProperties: readonly string[] =
  Object.keys((commentStickerRecipeSchema as { fields: object }).fields).sort();
