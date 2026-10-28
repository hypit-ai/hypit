import type { Facet } from "@hypit/facet";

import type {
  AuthorDeclarationCompiler,
  AuthorDeclarationRegistry,
} from "./declaration.js";

export const authorDeclarationFacetAbi = "hypit.author-declaration@1";

export function createAuthorDeclarationFacet(compiler: AuthorDeclarationCompiler): Facet {
  return { abi: authorDeclarationFacetAbi, implementation: compiler };
}

/** Install only package declaration compilers; unrelated package facets remain inert. */
export function installAuthorDeclarationFacets(
  facets: readonly Facet[],
  registry: Pick<AuthorDeclarationRegistry, "register">,
): void {
  for (const facet of facets) {
    if (facet.abi !== authorDeclarationFacetAbi) continue;
    registry.register(facet.implementation as AuthorDeclarationCompiler);
  }
}
