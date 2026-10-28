import { assertOrderedBuildId } from "./build-id.js";
import { isTypeRef } from "./identity.js";
import type { TypeRef } from "./identity.js";

/** One public Output selected by compilation, independent of Result storage. */
export type PublicationOutputIntent = {
  readonly displayName?: string;
  readonly name: string;
  readonly output: string;
  readonly target: boolean;
  /** Expected public type, independent of where this Build obtains the value. */
  readonly type: TypeRef;
  readonly source:
    | { readonly kind: "current-record"; readonly record: string }
    | {
        readonly kind: "historical-output";
        readonly build: string;
        readonly output: string;
      };
};

/** Compiler-owned publication intent; Result repositories decide how to materialize it. */
export type PublicationIntent = {
  readonly outputs: readonly PublicationOutputIntent[];
};

/** Validate publication intent without consulting execution or repository state. */
export function assertPublicationIntent(
  publication: unknown,
  options: { readonly build?: string } = {},
): asserts publication is PublicationIntent {
  if (publication === null || Array.isArray(publication) || typeof publication !== "object"
    || !Array.isArray((publication as Readonly<Record<string, unknown>>).outputs)) {
    throw new Error("Publication intent must contain an outputs array");
  }
  const names = new Set<string>();
  const outputs = new Set<string>();
  for (const [index, raw] of (publication as { readonly outputs: readonly unknown[] }).outputs.entries()) {
    if (raw === null || Array.isArray(raw) || typeof raw !== "object") {
      throw new Error(`Publication Output ${index} must be an object`);
    }
    const published = raw as Readonly<Record<string, unknown>>;
    if (typeof published.name !== "string" || published.name.trim().length === 0) {
      throw new Error("Publication Output name must not be empty");
    }
    if (typeof published.output !== "string" || published.output.trim().length === 0) {
      throw new Error(`Publication Output ${published.name} has no Logical Output`);
    }
    if (published.displayName !== undefined
      && (typeof published.displayName !== "string" || published.displayName.trim().length === 0)) {
      throw new Error(`Publication Output ${published.name} has an empty display name`);
    }
    if (typeof published.target !== "boolean") {
      throw new Error(`Publication Output ${published.name} target must be a boolean`);
    }
    if (!isTypeRef(published.type)) {
      throw new Error(`Publication Output ${published.name} type must be a Type reference`);
    }
    if (names.has(published.name)) throw new Error(`Publication Output name ${published.name} is repeated`);
    if (outputs.has(published.output)) {
      throw new Error(`Logical Output ${published.output} has more than one published name`);
    }
    names.add(published.name);
    outputs.add(published.output);
    if (published.source === null || Array.isArray(published.source) || typeof published.source !== "object") {
      throw new Error(`Logical Output ${published.output} has no publication source`);
    }
    const source = published.source as Readonly<Record<string, unknown>>;
    if (source.kind === "current-record") {
      if (typeof source.record !== "string" || source.record.trim().length === 0) {
        throw new Error(`Logical Output ${published.output} has no current Record source`);
      }
      continue;
    }
    if (source.kind !== "historical-output") {
      throw new Error(`Logical Output ${published.output} has an invalid publication source kind`);
    }
    if (typeof source.build !== "string" || source.build.trim().length === 0
      || typeof source.output !== "string" || source.output.trim().length === 0) {
      throw new Error(`Logical Output ${published.output} has an incomplete historical source`);
    }
    if (source.build === options.build) {
      throw new Error(`Logical Output ${published.output} cannot forward to its own Build`);
    }
    assertOrderedBuildId(source.build);
  }
}
