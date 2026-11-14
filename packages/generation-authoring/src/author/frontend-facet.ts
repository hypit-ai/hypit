import {
  createFrontendFacet,
  frontendsFromFacets,
} from "@hypit/facet";
import type {
  FrontendFacet,
  Facet,
} from "@hypit/facet";
import { sourceFrontendFacetKind } from "@hypit/generation-authoring/source";

import type { AuthorFrontend } from "./source.js";

export type AuthorFrontendFacet = FrontendFacet<"author", AuthorFrontend> & {
  readonly kind: typeof sourceFrontendFacetKind;
};

export function createAuthorFrontendFacet(frontend: AuthorFrontend): AuthorFrontendFacet {
  return createFrontendFacet(sourceFrontendFacetKind, "author", frontend) as AuthorFrontendFacet;
}

export function authorFrontendsFromFacets(facets: readonly Facet[]): readonly AuthorFrontend[] {
  return frontendsFromFacets<"author", AuthorFrontend>(sourceFrontendFacetKind, "author", facets);
}

export function installAuthorFrontendFacets(
  facets: readonly Facet[],
  registry: { register(frontend: AuthorFrontend): void },
): void {
  for (const frontend of authorFrontendsFromFacets(facets)) registry.register(frontend);
}
