import type { Facet } from "./facet.js";

export type FrontendImplementation = {
  readonly id: string;
};

export type FrontendFacet<
  Kind extends string,
  Frontend extends FrontendImplementation,
> = Facet & {
  readonly address: string;
  readonly implementation: {
    readonly kind: Kind;
    readonly frontend: Frontend;
  };
};

/** Build the common inert declaration shared by every contributed Source Frontend. */
export function createFrontendFacet<
  Kind extends string,
  Frontend extends FrontendImplementation,
>(abi: string, kind: Kind, frontend: Frontend): FrontendFacet<Kind, Frontend> {
  if (abi.trim().length === 0 || kind.trim().length === 0
    || frontend.id.trim().length === 0) {
    throw new Error(`${kind || "Source"} Frontend facet has an invalid identity`);
  }
  return {
    abi,
    address: frontend.id,
    implementation: {
      kind,
      frontend,
    },
  };
}

/** Select and validate Frontends owned by one exact Facet ABI and Frontend kind. */
export function frontendsFromFacets<
  Kind extends string,
  Frontend extends FrontendImplementation,
>(abi: string, kind: Kind, facets: readonly Facet[]): readonly Frontend[] {
  const values: Frontend[] = [];
  for (const facet of facets) {
    if (facet.abi !== abi || facet.implementation === null
      || typeof facet.implementation !== "object" || Array.isArray(facet.implementation)) continue;
    const implementation = facet.implementation as { readonly kind?: unknown; readonly frontend?: unknown };
    if (implementation.kind !== kind) continue;
    const frontend = implementation.frontend;
    if (frontend === null || typeof frontend !== "object" || Array.isArray(frontend)
      || typeof (frontend as { readonly id?: unknown }).id !== "string") {
      throw new Error(`${kind} Frontend facet has an invalid implementation`);
    }
    if (facet.address !== (frontend as Frontend).id) {
      throw new Error(`${kind} Frontend facet address does not match its implementation`);
    }
    values.push(frontend as Frontend);
  }
  return values;
}
