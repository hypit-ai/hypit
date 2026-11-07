import type { CanonicalValue } from "./value.js";
import { canonicalize } from "./canonical.js";

/** One completed value handed to an exact domain-owned publisher. */
export type PublicationOutputIntent = {
  readonly name: string;
  readonly record: string;
  readonly publisher: string;
  readonly parameters?: CanonicalValue;
};

/** Compiler-owned publication answers; Runtime does not infer product lifetime from value shape. */
export type PublicationIntent = {
  readonly outputs: readonly PublicationOutputIntent[];
};

/** Validate publication answers without consulting execution or storage state. */
export function assertPublicationIntent(intent: unknown): asserts intent is PublicationIntent {
  if (intent === null || Array.isArray(intent) || typeof intent !== "object"
    || !Array.isArray((intent as Readonly<Record<string, unknown>>).outputs)) {
    throw new Error("Publication intent must contain an outputs array");
  }
  const intentFields = Object.keys(intent as Readonly<Record<string, unknown>>);
  if (intentFields.length !== 1 || intentFields[0] !== "outputs") {
    throw new Error("Publication intent must contain only outputs");
  }
  const names = new Set<string>();
  for (const [index, raw] of (intent as { readonly outputs: readonly unknown[] }).outputs.entries()) {
    if (raw === null || Array.isArray(raw) || typeof raw !== "object") {
      throw new Error(`Publication Output ${index} must be an object`);
    }
    const output = raw as Readonly<Record<string, unknown>>;
    for (const key of Object.keys(output)) {
      if (key !== "name" && key !== "record" && key !== "publisher" && key !== "parameters") {
        throw new Error(`Publication Output ${index} has an unexpected ${key} field`);
      }
    }
    if (typeof output.name !== "string" || output.name.trim().length === 0) {
      throw new Error("Publication Output name must not be empty");
    }
    if (names.has(output.name)) throw new Error(`Publication Output name ${output.name} is repeated`);
    if (typeof output.record !== "string" || output.record.trim().length === 0) {
      throw new Error(`Publication Output ${output.name} has no Record`);
    }
    if (typeof output.publisher !== "string" || output.publisher.trim().length === 0) {
      throw new Error(`Publication Output ${output.name} has no publisher`);
    }
    if (output.parameters !== undefined) {
      canonicalize(output.parameters);
    }
    names.add(output.name);
  }
}
