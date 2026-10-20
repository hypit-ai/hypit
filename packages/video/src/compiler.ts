import type { CliCompilerOptions } from "@hypit/hypit/cli";
import { refinementPackagesFromFacets, registerTypeRefinements, RefinementRegistry } from "@hypit/hypit/refinement";
import { ModulePackageRegistry, Compiler } from "@hypit/hypit/compiler";
import { AuthorFrontendRegistry, installAuthorFrontendFacets } from "@hypit/hypit/author";
import {
  createMarkupAuthorFrontend,
  installMarkupSurfaceFacets,
  MarkupSurfaceRegistry,
} from "@hypit/hypit/markup";
import {
  resolveNodePackageResourceSpecifier,
  resolveNodePackageSource,
} from "@hypit/hypit/loader/node";
import { NodeFilesystemWorkspace } from "@hypit/hypit/workspace/node";

export function createVideoWorkspace(options: Pick<CliCompilerOptions,
  "workspaceRoot" | "assetRoots" | "packageRoot" | "distributionPackageRoot">) {
  const packageRoot = options.packageRoot ?? options.workspaceRoot ?? process.cwd();
  return new NodeFilesystemWorkspace({
    ...(options.workspaceRoot === undefined ? {} : { root: options.workspaceRoot }),
    ...(options.assetRoots === undefined ? {} : { assetRoots: options.assetRoots }),
    externalSourceResolver(importer, request) {
      const located = resolveNodePackageSource(request.from, {
        from: importer.id,
        workspaceRoots: [packageRoot],
        ...(options.distributionPackageRoot === undefined
          ? {}
          : { distributionRoots: [options.distributionPackageRoot] }),
      });
      return { root: located.root, source: located.source };
    },
    externalAssetResolver(importer, request) {
      const located = resolveNodePackageResourceSpecifier(request.from, {
        from: importer.id,
        workspaceRoots: [packageRoot],
        ...(options.distributionPackageRoot === undefined
          ? {}
          : { distributionRoots: [options.distributionPackageRoot] }),
      });
      return { root: located.root, asset: located.resource };
    },
  });
}

/** Assemble the Markup compiler Host from only the packages selected for this invocation. */
export function createVideoCompiler(options: CliCompilerOptions) {
  const modules = new ModulePackageRegistry();
  const surfaces = new MarkupSurfaceRegistry();
  const frontends = new AuthorFrontendRegistry();
  const refinements = new RefinementRegistry();
  for (const item of options.packageContributions) {
    for (const module of item.modules ?? []) modules.register(module);
    const facets = item.facets ?? [];
    installMarkupSurfaceFacets(facets, surfaces);
    installAuthorFrontendFacets(facets, frontends);
    for (const pack of refinementPackagesFromFacets(facets)) {
      registerTypeRefinements(refinements, pack.refinements ?? []);
    }
  }
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`No selected author package satisfies ${request.from}`);
      return resolved;
    },
  }));
  return new Compiler({
    modules,
    frontends,
    refinements,
    workspace: createVideoWorkspace(options),
  });
}
