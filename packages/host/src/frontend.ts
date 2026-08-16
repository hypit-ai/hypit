import type { HostFacet } from "./facet.js";

export type FrontendImplementation = {
  readonly id: string;
};

export type FrontendHostFacet<
  Kind extends string,
  Frontend extends FrontendImplementation,
> = HostFacet & {
  readonly offers: readonly [string];
  readonly implementation: {
    readonly kind: Kind;
    readonly frontend: Frontend;
  };
};

/** Build the common inert declaration shared by every self-described Source Frontend. */
export function createFrontendHostFacet<
  Kind extends string,
  Frontend extends FrontendImplementation,
>(abi: string, kind: Kind, frontend: Frontend): FrontendHostFacet<Kind, Frontend> {
  if (abi.trim().length === 0 || kind.trim().length === 0
    || frontend.id.trim().length === 0) {
    throw new Error(`${kind || "Source"} Frontend Host facet has an invalid identity`);
  }
  return {
    abi,
    offers: [frontend.id],
    implementation: {
      kind,
      frontend,
    },
  };
}

/** Select and validate Frontends owned by one exact Host ABI and Frontend kind. */
export function frontendsFromHostFacets<
  Kind extends string,
  Frontend extends FrontendImplementation,
>(abi: string, kind: Kind, facets: readonly HostFacet[]): readonly Frontend[] {
  const values: Frontend[] = [];
  for (const facet of facets) {
    if (facet.abi !== abi || facet.implementation === null
      || typeof facet.implementation !== "object" || Array.isArray(facet.implementation)) continue;
    const implementation = facet.implementation as { readonly kind?: unknown; readonly frontend?: unknown };
    if (implementation.kind !== kind) continue;
    const frontend = implementation.frontend;
    if (frontend === null || typeof frontend !== "object" || Array.isArray(frontend)
      || typeof (frontend as { readonly id?: unknown }).id !== "string") {
      throw new Error(`${kind} Frontend Host facet has an invalid implementation`);
    }
    values.push(frontend as Frontend);
  }
  return values;
}
