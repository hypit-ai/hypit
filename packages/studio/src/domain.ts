import { loadDiscoveredSourcePackages } from "@hypit/hypit/cli";
import type { CliDistribution } from "@hypit/hypit/cli";
import { producerPackagesFromFacets, registerProducerFacets } from "@hypit/hypit/producer";
import { ProducerRegistry } from "@hypit/hypit/executor";
import type { LoadedPackage, PackageContribution } from "@hypit/hypit/loader";
import type { Compiler } from "@hypit/hypit/compiler";
import { refinementPackagesFromFacets, registerTypeRefinements, RefinementRegistry } from "@hypit/hypit/refinement";

export type StudioDomain = {
  readonly packages: readonly LoadedPackage[];
  readonly contributions: readonly PackageContribution[];
  readonly createCompiler: () => Compiler;
  readonly producers: ProducerRegistry;
  readonly refinements: RefinementRegistry;
};

/**
 * Assemble Studio from the same recursive package selection as the official CLI.
 * The application assembles the video-domain view; selected packages contribute Studio Companions through facets.
 */
export async function loadStudioDomain(input: {
  readonly source: string;
  readonly workspaceRoot: string;
  readonly packageRoot: string;
  readonly distribution: CliDistribution;
}): Promise<StudioDomain> {
  const packages = await loadDiscoveredSourcePackages(input.distribution, {
    source: input.source,
    workspaceRoot: input.workspaceRoot,
    packageRoot: input.packageRoot,
    ...(input.distribution.packageRoot === undefined
      ? {}
      : { distributionPackageRoot: input.distribution.packageRoot }),
  });
  const contributions = packages.map((item) => item.contribution);
  const facets = contributions.flatMap((item) => item.facets ?? []);

  const producers = new ProducerRegistry();
  const refinements = new RefinementRegistry();
  for (const contribution of contributions) {
    const facets = contribution.facets ?? [];
    for (const item of producerPackagesFromFacets(facets)) registerProducerFacets(producers, item);
    for (const item of refinementPackagesFromFacets(facets)) registerTypeRefinements(refinements, item);
  }

  return {
    packages,
    contributions,
    createCompiler() {
      return input.distribution.createCompiler({
        workspaceRoot: input.workspaceRoot,
        packageRoot: input.packageRoot,
        ...(input.distribution.packageRoot === undefined
          ? {}
          : { distributionPackageRoot: input.distribution.packageRoot }),
        packageContributions: contributions,
      });
    },
    producers,
    refinements,
  };
}
