import type { Facet } from "@hypit/facet";

import type {
  AuthorDeclarationCompiler,
  AuthorDeclarationRegistry,
} from "./declaration.js";

export const authorDeclarationFacetKind = "hypit.author-declaration";

export function createAuthorDeclarationFacet(compiler: AuthorDeclarationCompiler): Facet {
  return { kind: authorDeclarationFacetKind, implementation: compiler };
}

/** Install only package declaration compilers; unrelated package facets remain inert. */
export function installAuthorDeclarationFacets(
  facets: readonly Facet[],
  registry: Pick<AuthorDeclarationRegistry, "register">,
): void {
  for (const facet of facets) {
    if (facet.kind !== authorDeclarationFacetKind) continue;
    registry.register(facet.implementation as AuthorDeclarationCompiler);
  }
}
