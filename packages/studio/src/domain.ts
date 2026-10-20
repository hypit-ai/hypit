import { loadDiscoveredSourcePackages } from "@hypit/hypit/cli";
import type { CliDistribution } from "@hypit/hypit/cli";
import { producerPackagesFromFacets, registerProducerFacets } from "@hypit/hypit/producer";
import { createResolvedClosure } from "@hypit/hypit/kernel";
import { ProducerRegistry } from "@hypit/hypit/executor";
import {
  AuthorFrontendRegistry,
  installAuthorFrontendFacets,
} from "@hypit/hypit/author";
import {
  createMarkupAuthorFrontend,
  installMarkupSurfaceFacets,
  MarkupSurfaceRegistry,
} from "@hypit/hypit/markup";
import type { MarkupSurfaceRegistryLike } from "@hypit/hypit/markup";
import type { LoadedPackage, PackageContribution } from "@hypit/hypit/loader";
import { ModulePackageRegistry, Compiler } from "@hypit/hypit/compiler";
import type { ModuleRef, ResolvedModuleClosure } from "@hypit/hypit/protocol";
import { refinementPackagesFromFacets, registerTypeRefinements, RefinementRegistry } from "@hypit/hypit/refinement";

export type StudioDomain = {
  readonly packages: readonly LoadedPackage[];
  readonly contributions: readonly PackageContribution[];
  readonly compiler: Compiler;
  readonly createCompiler: (surfaces?: MarkupSurfaceRegistryLike) => Compiler;
  readonly closure: ResolvedModuleClosure;
  readonly surfaces: MarkupSurfaceRegistry;
  readonly producers: ProducerRegistry;
  readonly refinements: RefinementRegistry;
  readonly resolveModule: (specifier: string) => ModuleRef | undefined;
  readonly frontends: (surfaces?: MarkupSurfaceRegistryLike) => AuthorFrontendRegistry;
};

/**
 * Assemble Studio from the same recursive package selection as the official CLI.
 * The application assembles the video-domain view; selected packages contribute Studio Companions through facets.
 */
export async function loadStudioDomain(input: {
  readonly run: string;
  readonly workspaceRoot: string;
  readonly packageRoot: string;
  readonly distribution: CliDistribution;
}): Promise<StudioDomain> {
  const packages = await loadDiscoveredSourcePackages(input.distribution, {
    source: input.run,
    workspaceRoot: input.workspaceRoot,
    packageRoot: input.packageRoot,
    ...(input.distribution.packageRoot === undefined
      ? {}
      : { distributionPackageRoot: input.distribution.packageRoot }),
  });
  const contributions = packages.map((item) => item.contribution);
  const manifests = contributions.flatMap((item) =>
    (item.modules ?? []).map((module) => module.manifest));
  const closure = createResolvedClosure(manifests);

  const modules = new Map<string, ModuleRef>();
  const moduleRegistry = new ModulePackageRegistry();
  for (const contribution of contributions) {
    for (const module of contribution.modules ?? []) {
      moduleRegistry.register(module);
      const ref = { name: module.manifest.name, version: module.manifest.version };
      for (const specifier of [
        module.manifest.name,
        `${module.manifest.name}@${module.manifest.version}`,
        ...(module.specifiers ?? []),
      ]) modules.set(specifier, ref);
    }
  }
  const resolveModule = (specifier: string): ModuleRef | undefined => modules.get(specifier);
  const facets = contributions.flatMap((item) => item.facets ?? []);
  const surfaces = new MarkupSurfaceRegistry();
  installMarkupSurfaceFacets(facets, surfaces);
  const domainFrontends = (registry: MarkupSurfaceRegistryLike): AuthorFrontendRegistry => {
    const frontends = new AuthorFrontendRegistry();
    frontends.register(createMarkupAuthorFrontend({
      registry,
      resolveModule(request) {
        const found = resolveModule(request.from);
        if (found === undefined) throw new Error(`No selected Source package satisfies ${request.from}`);
        return found;
      },
    }));
    installAuthorFrontendFacets(facets, frontends);
    return frontends;
  };

  const producers = new ProducerRegistry();
  const refinements = new RefinementRegistry();
  for (const contribution of contributions) {
    const facets = contribution.facets ?? [];
    for (const item of producerPackagesFromFacets(facets)) registerProducerFacets(producers, item.producers ?? []);
    for (const item of refinementPackagesFromFacets(facets)) registerTypeRefinements(refinements, item.refinements ?? []);
  }

  return {
    packages,
    contributions,
    compiler: input.distribution.createCompiler({
      workspaceRoot: input.workspaceRoot,
      packageRoot: input.packageRoot,
      ...(input.distribution.packageRoot === undefined
        ? {}
        : { distributionPackageRoot: input.distribution.packageRoot }),
      packageContributions: contributions,
    }),
    createCompiler(registry) {
      if (registry === undefined) {
        return input.distribution.createCompiler({
          workspaceRoot: input.workspaceRoot,
          packageRoot: input.packageRoot,
          ...(input.distribution.packageRoot === undefined
            ? {}
            : { distributionPackageRoot: input.distribution.packageRoot }),
          packageContributions: contributions,
        });
      }
      const frontends = domainFrontends(registry);
      return new Compiler({
        modules: moduleRegistry,
        frontends,
        refinements,
        workspace: input.distribution.createWorkspace({
          workspaceRoot: input.workspaceRoot,
          packageRoot: input.packageRoot,
          ...(input.distribution.packageRoot === undefined
            ? {}
            : { distributionPackageRoot: input.distribution.packageRoot }),
        }),
      });
    },
    closure,
    surfaces,
    producers,
    refinements,
    resolveModule,
    frontends(registry = surfaces) { return domainFrontends(registry); },
  };
}
