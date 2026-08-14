import {
  createFrontendHostFacet,
  frontendsFromHostFacets,
} from "@narratage/host";
import type {
  FrontendHostFacet,
  HostFacet,
} from "@narratage/host";
import { sourceFrontendPackageAbi } from "@narratage/source";

import type { AuthorFrontend } from "./source.js";

export type AuthorFrontendHostFacet = FrontendHostFacet<"author", AuthorFrontend> & {
  readonly abi: typeof sourceFrontendPackageAbi;
};

export function createAuthorFrontendHostFacet(frontend: AuthorFrontend): AuthorFrontendHostFacet {
  return createFrontendHostFacet(sourceFrontendPackageAbi, "author", frontend) as AuthorFrontendHostFacet;
}

export function authorFrontendsFromHostFacets(facets: readonly HostFacet[]): readonly AuthorFrontend[] {
  return frontendsFromHostFacets<"author", AuthorFrontend>(sourceFrontendPackageAbi, "author", facets);
}

export function installAuthorFrontendHostFacets(
  facets: readonly HostFacet[],
  registry: { register(frontend: AuthorFrontend): void },
): void {
  for (const frontend of authorFrontendsFromHostFacets(facets)) registry.register(frontend);
}
