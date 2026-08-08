import type { CanonicalValue, ProgramSpace, Track, ValueSchema } from "../svml.js";

/**
 * What a control needs to know that `ValueSchema` cannot say.
 *
 * `ValueSchema` describes what a value *is*, not how it should be typed in. SVS
 * geometry is normalized 0–1, which a slider edits far better than a number box,
 * and colours may carry alpha, which `<input type=color>` cannot express.
 */
export type FieldHint = "color" | "multiline" | "unit-fraction";

export type BuildInput = {
  readonly parameters: CanonicalValue;
  readonly content: CanonicalValue;
  readonly programSpace: ProgramSpace;
  readonly canvas: { readonly width: number; readonly height: number };
};

/**
 * One previewable component.
 *
 * `build` returns Tracks rather than a Composition: the shell owns the canvas,
 * the ProgramSpace and the seal, so adding a component is one file and one entry
 * in the registry array. Everything a component states about itself — its
 * parameters, its sample content, how a Recipe fills it in — lives here, and the
 * form is generated from it rather than written per component.
 */
export type PreviewComponent = {
  readonly id: string;
  readonly label: string;
  /**
   * The exact SVS property key set this component's Recipe carries. Absent means
   * the component is not discoverable from a stylesheet. Matching is by key set
   * because that is what the compiler itself matches on — a Recipe's dotted path
   * is a label, and `caption.dialogue` and `caption.short-cues` are different
   * shapes under one prefix.
   */
  readonly recipeKeys?: readonly string[];
  readonly parameters: ValueSchema;
  readonly content: ValueSchema;
  readonly hints?: Readonly<Record<string, FieldHint>>;
  readonly defaults: () => { parameters: CanonicalValue; content: CanonicalValue };
  /** Fills the parameter form from a Recipe. The form stays the source of truth. */
  readonly fromRecipe?: (properties: Readonly<Record<string, CanonicalValue>>) => CanonicalValue;
  readonly build: (input: BuildInput) => readonly Track[];
};

/** Narrows a form value to the object every component's parameters and content are. */
export function fields(value: CanonicalValue): Readonly<Record<string, CanonicalValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object of fields.");
  }
  return value as Readonly<Record<string, CanonicalValue>>;
}

export function text(value: CanonicalValue | undefined, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  return value;
}

export function number(value: CanonicalValue | undefined, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}

export function list(value: CanonicalValue | undefined, name: string): readonly CanonicalValue[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be a list.`);
  return value;
}
