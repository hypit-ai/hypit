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
>(facetKind: string, frontendKind: Kind, frontend: Frontend): FrontendFacet<Kind, Frontend> {
  if (facetKind.trim().length === 0 || frontendKind.trim().length === 0
    || frontend.id.trim().length === 0) {
    throw new Error(`${frontendKind || "Source"} Frontend facet has an invalid identity`);
  }
  return {
    kind: facetKind,
    address: frontend.id,
    implementation: {
      kind: frontendKind,
      frontend,
    },
  };
}

/** Select and validate Frontends owned by one exact Facet kind and Frontend role. */
export function frontendsFromFacets<
  Kind extends string,
  Frontend extends FrontendImplementation,
>(facetKind: string, frontendKind: Kind, facets: readonly Facet[]): readonly Frontend[] {
  const values: Frontend[] = [];
  for (const facet of facets) {
    if (facet.kind !== facetKind || facet.implementation === null
      || typeof facet.implementation !== "object" || Array.isArray(facet.implementation)) continue;
    const implementation = facet.implementation as { readonly kind?: unknown; readonly frontend?: unknown };
    if (implementation.kind !== frontendKind) continue;
    const frontend = implementation.frontend;
    if (frontend === null || typeof frontend !== "object" || Array.isArray(frontend)
      || typeof (frontend as { readonly id?: unknown }).id !== "string") {
      throw new Error(`${frontendKind} Frontend facet has an invalid implementation`);
    }
    if (facet.address !== (frontend as Frontend).id) {
      throw new Error(`${frontendKind} Frontend facet address does not match its implementation`);
    }
    values.push(frontend as Frontend);
  }
  return values;
}
