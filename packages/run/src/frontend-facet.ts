import {
  createFrontendHostFacet,
  frontendsFromHostFacets,
} from "@hypit/host";
import type {
  FrontendHostFacet,
  HostFacet,
} from "@hypit/host";
import { sourceFrontendPackageAbi } from "@hypit/source";

import type { RunFrontend } from "./types.js";

export type RunFrontendHostFacet = FrontendHostFacet<"run", RunFrontend> & {
  readonly abi: typeof sourceFrontendPackageAbi;
};

export function createRunFrontendHostFacet(frontend: RunFrontend): RunFrontendHostFacet {
  return createFrontendHostFacet(sourceFrontendPackageAbi, "run", frontend) as RunFrontendHostFacet;
}

export function runFrontendsFromHostFacets(facets: readonly HostFacet[]): readonly RunFrontend[] {
  return frontendsFromHostFacets<"run", RunFrontend>(sourceFrontendPackageAbi, "run", facets);
}
