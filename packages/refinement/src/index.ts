import type { Facet } from "@hypit/facet";
import type { Value, TypeRef, TypedRecord } from "@hypit/protocol";
import { typeIdentity, typeKey } from "@hypit/protocol";

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

export type RefinementPackage = readonly TypeRefinement[];

export const refinementPackageFacetAbi = "hypit.refinement-package@1";

export type RefinementPackageFacet = Facet & {
  readonly abi: typeof refinementPackageFacetAbi;
  readonly implementation: RefinementPackage;
};

export function createRefinementPackageFacet(refinements: RefinementPackage): RefinementPackageFacet {
  if (!Array.isArray(refinements)) throw new Error("Refinement package must be an array of Type refinements");
  return {
    abi: refinementPackageFacetAbi,
    implementation: refinements,
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

export interface RefinementRegistryLike {
  resolve(type: TypeRef): TypeRefinementHandler | undefined;
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
  readonly #refinements = new Map<string, TypeRefinementHandler>();

  register(
    type: TypeRef,
    handler: TypeRefinementHandler,
  ): void {
    const identity = typeIdentity(type);
    const display = typeKey(type);
    if (this.#refinements.has(identity)) {
      throw new RefinementError("DUPLICATE_TYPE_REFINEMENT", `${display} refinement is already registered`, display);
    }
    this.#refinements.set(identity, handler);
  }

  resolve(type: TypeRef): TypeRefinementHandler | undefined {
    return this.#refinements.get(typeIdentity(type));
  }
}

export async function refineValue(
  type: TypeRef,
  value: Value,
  registry: RefinementRegistryLike,
): Promise<void> {
  const handler = registry.resolve(type);
  if (handler === undefined) return;
  try {
    await handler({ type: structuredClone(type), value: structuredClone(value) });
  } catch (error) {
    throw new RefinementError(
      "TYPE_REFINEMENT_REJECTED",
      `${typeKey(type)} rejected the value: ${error instanceof Error ? error.message : String(error)}`,
      typeKey(type),
    );
  }
}

export async function refineRecord(
  record: TypedRecord,
  registry: RefinementRegistryLike,
): Promise<void> {
  await refineValue(record.type, record.value, registry);
}
