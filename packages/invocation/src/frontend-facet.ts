import {
  createFrontendFacet,
  frontendsFromFacets,
} from "@hypit/facet";
import type {
  FrontendFacet,
  Facet,
} from "@hypit/facet";
import { sourceFrontendPackageAbi } from "@hypit/source";

import type { InvocationFrontend } from "./types.js";

export type InvocationFrontendFacet = FrontendFacet<"invocation", InvocationFrontend> & {
  readonly abi: typeof sourceFrontendPackageAbi;
};

export function createInvocationFrontendFacet(frontend: InvocationFrontend): InvocationFrontendFacet {
  return createFrontendFacet(sourceFrontendPackageAbi, "invocation", frontend) as InvocationFrontendFacet;
}

export function invocationFrontendsFromFacets(facets: readonly Facet[]): readonly InvocationFrontend[] {
  return frontendsFromFacets<"invocation", InvocationFrontend>(sourceFrontendPackageAbi, "invocation", facets);
}
