import type { Facet } from "@hypit/facet";

import type { AuthorAdopter, AuthorAdopterRegistry } from "./adoption.js";

export const authorAdopterFacetAbi = "hypit.author-adopter@1";

export function createAuthorAdopterFacet(adopter: AuthorAdopter): Facet {
  return { abi: authorAdopterFacetAbi, implementation: adopter };
}

/** Install explicit author adopters; unrelated package facets remain inert. */
export function installAuthorAdopterFacets(
  facets: readonly Facet[],
  registry: Pick<AuthorAdopterRegistry, "register">,
): void {
  for (const facet of facets) {
    if (facet.abi !== authorAdopterFacetAbi) continue;
    registry.register(facet.implementation as AuthorAdopter);
  }
}
