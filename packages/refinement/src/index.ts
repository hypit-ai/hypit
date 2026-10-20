import type { Facet } from "@hypit/facet";
import type { Value, TypeRef, TypedRecord } from "@hypit/protocol";
import { typeKey } from "@hypit/protocol";

export type TypeRefinementContext = {
  readonly type: TypeRef;
  readonly value: Value;
};

export type TypeRefinementHandler = (
  context: TypeRefinementContext,
) => void | Promise<void>;

export interface TypeRefinementRegistrar {
  register(type: TypeRef, handler: TypeRefinementHandler): void;
}

/** One package-owned semantic predicate for an exact nominal Type. */
export type TypeRefinement = {
  readonly type: TypeRef;
  readonly handler: TypeRefinementHandler;
};

export type RefinementPackage = {
  readonly refinements?: readonly TypeRefinement[];
};

export const refinementPackageFacetAbi = "hypit.refinement-package@1";

export type RefinementPackageFacet = Facet & {
  readonly abi: typeof refinementPackageFacetAbi;
  readonly implementation: RefinementPackage;
};

export function createRefinementPackageFacet(value: unknown): RefinementPackageFacet {
  const item = value !== null && typeof value === "object"
    ? value as RefinementPackage
    : {};
  return {
    abi: refinementPackageFacetAbi,
    implementation: item.refinements === undefined ? {} : { refinements: item.refinements },
  };
}

export function refinementPackagesFromFacets(facets: readonly Facet[]): readonly RefinementPackage[] {
  return facets.flatMap((facet) => facet.abi === refinementPackageFacetAbi
    ? [(facet as RefinementPackageFacet).implementation]
    : []);
}

export function registerTypeRefinements(
  registry: TypeRefinementRegistrar,
  facets: readonly TypeRefinement[],
): void {
  for (const facet of facets) registry.register(facet.type, facet.handler);
}

export type TypeRefinementRegistration = {
  readonly handler: TypeRefinementHandler;
};

export interface RefinementRegistryLike {
  resolve(type: TypeRef): TypeRefinementRegistration | undefined;
}

export class RefinementError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "RefinementError";
    this.code = code;
    this.subject = subject;
  }
}

export class RefinementRegistry implements RefinementRegistryLike, TypeRefinementRegistrar {
  readonly #refinements = new Map<string, TypeRefinementRegistration>();

  register(
    type: TypeRef,
    handler: TypeRefinementHandler,
  ): void {
    const key = typeKey(type);
    if (this.#refinements.has(key)) {
      throw new RefinementError("DUPLICATE_TYPE_REFINEMENT", `${key} refinement is already registered`, key);
    }
    this.#refinements.set(key, { handler });
  }

  resolve(type: TypeRef): TypeRefinementRegistration | undefined {
    return this.#refinements.get(typeKey(type));
  }
}

async function refineValue(
  type: TypeRef,
  value: Value,
  registry: RefinementRegistryLike,
): Promise<void> {
  const registration = registry.resolve(type);
  if (registration === undefined) return;
  try {
    await registration.handler({ type: structuredClone(type), value: structuredClone(value) });
  } catch (error) {
    throw new RefinementError(
      "TYPE_REFINEMENT_REJECTED",
      `${typeKey(type)} rejected the value: ${error instanceof Error ? error.message : String(error)}`,
      typeKey(type),
    );
  }
}

export async function validateValue(
  type: TypeRef,
  value: Value,
  registry: RefinementRegistryLike,
): Promise<void> {
  await refineValue(type, value, registry);
}

export async function validateRecord(
  record: TypedRecord,
  registry: RefinementRegistryLike,
): Promise<TypedRecord> {
  await refineValue(record.type, record.value, registry);
  return record;
}

export function createRecordValidator(
  registry: RefinementRegistryLike,
): (record: TypedRecord) => Promise<void> {
  return async (record) => {
    await validateRecord(record, registry);
  };
}
