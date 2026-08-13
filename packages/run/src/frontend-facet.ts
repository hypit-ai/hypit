import {
  createFrontendHostFacet,
  frontendsFromHostFacets,
} from "@narratage/host";
import type {
  FrontendHostFacet,
  HostFacet,
} from "@narratage/host";
import { sourceFrontendPackageAbi } from "@narratage/source";

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
