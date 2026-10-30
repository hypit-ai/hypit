/** One value whose lifetime extends beyond this Build. */
export type ResultOutputIntent = {
  readonly name: string;
  readonly record: string;
};

/** Compiler-owned Result lifetime intent; repositories decide how to materialize it. */
export type ResultIntent = {
  readonly outputs: readonly ResultOutputIntent[];
};

/** Validate Result intent without consulting execution or repository state. */
export function assertResultIntent(intent: unknown): asserts intent is ResultIntent {
  if (intent === null || Array.isArray(intent) || typeof intent !== "object"
    || !Array.isArray((intent as Readonly<Record<string, unknown>>).outputs)) {
    throw new Error("Result intent must contain an outputs array");
  }
  const intentFields = Object.keys(intent as Readonly<Record<string, unknown>>);
  if (intentFields.length !== 1 || intentFields[0] !== "outputs") {
    throw new Error("Result intent must contain only outputs");
  }
  const names = new Set<string>();
  for (const [index, raw] of (intent as { readonly outputs: readonly unknown[] }).outputs.entries()) {
    if (raw === null || Array.isArray(raw) || typeof raw !== "object") {
      throw new Error(`Result Output ${index} must be an object`);
    }
    const output = raw as Readonly<Record<string, unknown>>;
    for (const key of Object.keys(output)) {
      if (key !== "name" && key !== "record") {
        throw new Error(`Result Output ${index} has an unexpected ${key} field`);
      }
    }
    if (typeof output.name !== "string" || output.name.trim().length === 0) {
      throw new Error("Result Output name must not be empty");
    }
    if (names.has(output.name)) throw new Error(`Result Output name ${output.name} is repeated`);
    if (typeof output.record !== "string" || output.record.trim().length === 0) {
      throw new Error(`Result Output ${output.name} has no Record`);
    }
    names.add(output.name);
  }
}
