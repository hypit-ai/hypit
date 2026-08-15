import { canonicalStringify } from "@narratage/protocol";

import type { HostFacet } from "./facet.js";

export type FrontendImplementation = {
  readonly id: string;
};

export type FrontendHostFacet<
  Kind extends string,
  Frontend extends FrontendImplementation,
> = HostFacet & {
  readonly offers: readonly [string];
  readonly identity: {
    readonly kind: Kind;
  };
  readonly implementation: Frontend;
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
    identity: {
      kind,
    },
    implementation: frontend,
  };
}

/** Select and validate Frontends owned by one exact Host ABI and Frontend kind. */
export function frontendsFromHostFacets<
  Kind extends string,
  Frontend extends FrontendImplementation,
>(abi: string, kind: Kind, facets: readonly HostFacet[]): readonly Frontend[] {
  const values: Frontend[] = [];
  for (const opaque of facets) {
    if (opaque.abi !== abi
      || opaque.identity === undefined
      || opaque.identity === null
      || typeof opaque.identity !== "object"
      || Array.isArray(opaque.identity)
      || (opaque.identity as { readonly kind?: unknown }).kind !== kind) continue;
    const facet = opaque as FrontendHostFacet<Kind, Frontend>;
    const frontend = facet.implementation;
    if (frontend === null || typeof frontend !== "object" || Array.isArray(frontend)) {
      throw new Error(`${kind} Frontend Host facet has an invalid implementation`);
    }
    const expected = createFrontendHostFacet(abi, kind, frontend);
    if (canonicalStringify(facet.offers) !== canonicalStringify(expected.offers)
      || canonicalStringify(facet.identity) !== canonicalStringify(expected.identity)) {
      throw new Error(`${kind} Frontend Host facet ${frontend.id} differs from its locked identity`);
    }
    values.push(frontend);
  }
  return values;
}
