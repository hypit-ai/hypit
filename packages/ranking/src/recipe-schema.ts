import type { ValueSchema } from "@narratage/protocol";

import {
  COLUMN_PROPERTIES,
  TIER_BOARD_PROPERTIES,
  TOP_THREE_PROPERTIES,
  TYPEWRITER_LIST_PROPERTIES,
} from "./style.js";

/**
 * The properties an author writes in a Ranking Recipe, one schema per variant.
 *
 * Each `decode*Style` decides what its variant may contain in the shape of
 * control flow: a reader call per property, its type implied by which reader
 * was called. That is enough to compile a stylesheet and not enough for
 * anything else to offer one, so the same facts are stated here as data.
 *
 * Which properties exist is not restated — it is taken from the decoders' own
 * lists, so a property added there appears here without anyone remembering to.
 * The groups below only say what each one is, and a property belonging to none
 * of them fails at load rather than quietly becoming untypeable.
 *
 * The bounds are the ones in `schedule.ts`, where every one of these values is
 * finally judged.
 */

const COLORS = [
  "text-color", "board-background", "board-border-color", "board-shadow-color",
  "title-color", "item-color", "emphasis-color", "winner-color",
];

/** A place in the frame, given as a fraction of it. */
const UNIT_FRACTIONS = ["stage-x", "stage-y", "center-x", "baseline-y"];

/**
 * Extents and multipliers, none of which may be negative. Several must be
 * strictly positive and `ValueSchema` has no exclusive bound to say so, so that
 * half of the rule stays where it is already enforced.
 */
const MEASURES = [
  "font-size", "line-height", "title-font-size", "title-line-height",
  "item-font-size", "item-line-height", "label-width", "row-height", "stage-size",
  "icon-size", "slot-gap", "board-border-width", "board-radius", "board-shadow-blur",
  "padding", "row-gap", "cell-gap", "icon-radius", "ring-width", "label-gap", "title-gap",
];

/** Offsets and an angle, which mean opposite things either side of zero. */
const SIGNED = ["board-shadow-x", "board-shadow-y", "board-shadow-spread", "rotation"];

/** Where a layer sits, which may be behind whatever the Build put at zero. */
const STACKING = ["board-stack", "item-stack", "stage-stack"];

/** A CSS weight, which the Style validator holds to its usual range. */
const WEIGHTS = ["font-weight", "title-font-weight", "item-font-weight"];

const GAINS = ["appear-gain", "move-gain"];

/** Whole frames. A fade may be absent; the rest only mean something once one has passed. */
const FRAME_COUNTS: Readonly<Record<string, number>> = {
  "appear-frames": 1, "move-frames": 1, "frames-per-grapheme": 1, "winner-frames": 1,
  "sound-fade-frames": 0,
};

/** Several values in one property, joined by a bar, so never a colour to pick. */
const STRINGS = ["rows", "rank-colors", "slot-colors"];

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  "motion-easing": ["linear", "ease-in", "ease-out", "ease-in-out"],
  "icon-fit": ["contain", "cover"],
};

/** What each group means, resolved per property. */
function schemaFor(name: string): ValueSchema | undefined {
  if (COLORS.includes(name)) return { kind: "string", format: "color" };
  if (UNIT_FRACTIONS.includes(name)) {
    return { kind: "number", format: "unit-fraction", minimum: 0, maximum: 1 };
  }
  if (MEASURES.includes(name)) return { kind: "number", minimum: 0 };
  if (SIGNED.includes(name)) return { kind: "number" };
  if (STACKING.includes(name)) return { kind: "number", integer: true };
  if (WEIGHTS.includes(name)) return { kind: "number", integer: true, minimum: 1, maximum: 1_000 };
  if (GAINS.includes(name)) return { kind: "number", minimum: 0, maximum: 64 };
  const frames = FRAME_COUNTS[name];
  if (frames !== undefined) return { kind: "number", integer: true, minimum: frames };
  if (STRINGS.includes(name)) return { kind: "string" };
  const values = ENUMS[name];
  return values === undefined ? undefined : { kind: "string", enum: values };
}

/** Every reader takes a fallback, so a Recipe may be as short as the one line an author cares about. */
function schemaOf(variant: string, names: readonly string[]): ValueSchema {
  const fields: Record<string, { schema: ValueSchema; optional: true }> = {};
  for (const name of names) {
    const schema = schemaFor(name);
    if (schema === undefined) {
      throw new Error(`Ranking ${variant} Recipe property ${name} has no declared type`);
    }
    fields[name] = { schema, optional: true };
  }
  return { kind: "object", fields };
}

export const tierBoardRecipeSchema: ValueSchema = schemaOf("Tier Board", TIER_BOARD_PROPERTIES);
export const columnRecipeSchema: ValueSchema = schemaOf("Column", COLUMN_PROPERTIES);
export const topThreeRecipeSchema: ValueSchema = schemaOf("Top Three", TOP_THREE_PROPERTIES);
export const typewriterListRecipeSchema: ValueSchema =
  schemaOf("Typewriter List", TYPEWRITER_LIST_PROPERTIES);

/** Every property name any of the four variants states, for callers that need the set. */
export const rankingRecipeProperties: readonly string[] = [...new Set([
  ...TIER_BOARD_PROPERTIES, ...COLUMN_PROPERTIES, ...TOP_THREE_PROPERTIES, ...TYPEWRITER_LIST_PROPERTIES,
])].sort();
