import { loadDiscoveredSourcePackages } from "@hypit/cli";
import { registerProducerFacets, registerTypeValidatorFacets } from "@hypit/component-kit";
import { createResolvedClosure } from "@hypit/core";
import { ProducerRegistry } from "@hypit/driver-node";
import {
  AuthorFrontendRegistry,
  installAuthorFrontendHostFacets,
} from "@hypit/elaborator";
import {
  createMarkupAuthorFrontend,
  installMarkupSurfaceHostFacets,
  MarkupSurfaceRegistry,
} from "@hypit/markup";
import type { MarkupSurfaceRegistryLike } from "@hypit/markup";
import type { LoadedPackage, NodePackageContribution } from "@hypit/package-loader-node";
import { ModulePackageRegistry, NodeCompiler } from "@hypit/compiler-node";
import type { ModuleRef, ResolvedModuleClosure } from "@hypit/protocol";
import { TypeValidatorRegistry } from "@hypit/validation";
import { createVideoCompiler, createVideoWorkspace, videoCliDistribution } from "@hypit/video-cli";

export type StudioDomain = {
  readonly packages: readonly LoadedPackage[];
  readonly contributions: readonly NodePackageContribution[];
  readonly compiler: NodeCompiler;
  readonly createCompiler: (surfaces?: MarkupSurfaceRegistryLike) => NodeCompiler;
  readonly closure: ResolvedModuleClosure;
  readonly surfaces: MarkupSurfaceRegistry;
  readonly producers: ProducerRegistry;
  readonly validators: TypeValidatorRegistry;
  readonly resolveModule: (specifier: string) => ModuleRef | undefined;
  readonly frontends: (surfaces?: MarkupSurfaceRegistryLike) => AuthorFrontendRegistry;
};

/**
 * Assemble Studio from the same recursive package selection as the official CLI.
 * The application owns this video-domain view; packages never register Studio metadata.
 */
export async function loadStudioDomain(input: {
  readonly run: string;
  readonly workspaceRoot: string;
  readonly packageRoot: string;
}): Promise<StudioDomain> {
  const packages = await loadDiscoveredSourcePackages(videoCliDistribution, {
    source: input.run,
    workspaceRoot: input.workspaceRoot,
    packageRoot: input.packageRoot,
    ...(videoCliDistribution.packageRoot === undefined
      ? {}
      : { distributionPackageRoot: videoCliDistribution.packageRoot }),
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
  const facets = contributions.flatMap((item) => item.hostFacets ?? []);
  const surfaces = new MarkupSurfaceRegistry();
  installMarkupSurfaceHostFacets(facets, surfaces);
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
    installAuthorFrontendHostFacets(facets, frontends);
    return frontends;
  };

  const producers = new ProducerRegistry();
  const validators = new TypeValidatorRegistry();
  for (const contribution of contributions) {
    for (const component of contribution.components ?? []) {
      registerProducerFacets(producers, component.producers ?? []);
      registerTypeValidatorFacets(validators, component.validators ?? []);
    }
  }

  return {
    packages,
    contributions,
    compiler: createVideoCompiler({
      workspaceRoot: input.workspaceRoot,
      packageRoot: input.packageRoot,
      ...(videoCliDistribution.packageRoot === undefined
        ? {}
        : { distributionPackageRoot: videoCliDistribution.packageRoot }),
      packageContributions: contributions,
    }),
    createCompiler(registry) {
      if (registry === undefined) {
        return createVideoCompiler({
          workspaceRoot: input.workspaceRoot,
          packageRoot: input.packageRoot,
          ...(videoCliDistribution.packageRoot === undefined
            ? {}
            : { distributionPackageRoot: videoCliDistribution.packageRoot }),
          packageContributions: contributions,
        });
      }
      const frontends = domainFrontends(registry);
      return new NodeCompiler({
        modules: moduleRegistry,
        frontends,
        validators,
        workspace: createVideoWorkspace({
          workspaceRoot: input.workspaceRoot,
          packageRoot: input.packageRoot,
          ...(videoCliDistribution.packageRoot === undefined
            ? {}
            : { distributionPackageRoot: videoCliDistribution.packageRoot }),
        }),
      });
    },
    closure,
    surfaces,
    producers,
    validators,
    resolveModule,
    frontends(registry = surfaces) { return domainFrontends(registry); },
  };
}
