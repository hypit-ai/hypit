import type { BuildCliCompilerOptions } from "@hypit/build-cli";
import { refinementPackagesFromFacets, registerTypeRefinements, RefinementRegistry } from "@hypit/refinement";
import { ModulePackageRegistry, Compiler } from "@hypit/compiler";
import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  installAuthorDeclarationFacets,
  installAuthorFrontendFacets,
} from "@hypit/author";
import { createSvmlAuthorFrontend } from "@hypit/svml";
import { svmlAuthorFrontendId } from "@hypit/svml";
import {
  resolveNodePackageResourceSpecifier,
  resolveNodePackageSource,
} from "@hypit/loader/node";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";

export function createToolchainWorkspace(options: Pick<BuildCliCompilerOptions,
  "workspaceRoot" | "assetRoots" | "packageRoot" | "distributionPackageRoot">) {
  const packageRoot = options.packageRoot ?? options.workspaceRoot ?? process.cwd();
  return new NodeFilesystemWorkspace({
    ...(options.workspaceRoot === undefined ? {} : { root: options.workspaceRoot }),
    ...(options.assetRoots === undefined ? {} : { assetRoots: options.assetRoots }),
    sourceAdapter: (unit) => ({ unit, frontend: svmlAuthorFrontendId }),
    externalSourceResolver(importer, request) {
      const located = resolveNodePackageSource(request.from, {
        from: importer.path,
        workspaceRoots: [packageRoot],
        ...(options.distributionPackageRoot === undefined
          ? {}
          : { distributionRoots: [options.distributionPackageRoot] }),
      });
      return { root: located.root, source: located.source };
    },
    externalAssetResolver(importer, request) {
      const located = resolveNodePackageResourceSpecifier(request.from, {
        from: importer.path,
        workspaceRoots: [packageRoot],
        ...(options.distributionPackageRoot === undefined
          ? {}
          : { distributionRoots: [options.distributionPackageRoot] }),
      });
      return { root: located.root, asset: located.resource };
    },
  });
}

/** Assemble the canonical SVML compiler from only the packages selected for this compilation. */
export function createToolchainCompiler(options: BuildCliCompilerOptions) {
  const modules = new ModulePackageRegistry();
  const declarations = new AuthorDeclarationRegistry();
  const frontends = new AuthorFrontendRegistry();
  const refinements = new RefinementRegistry();
  for (const item of options.packageContributions) {
    for (const module of item.modules ?? []) modules.register(module);
    const facets = item.facets ?? [];
    installAuthorDeclarationFacets(facets, declarations);
    installAuthorFrontendFacets(facets, frontends);
    for (const pack of refinementPackagesFromFacets(facets)) {
      registerTypeRefinements(refinements, pack);
    }
  }
  frontends.register(createSvmlAuthorFrontend({ compilers: declarations }));
  return new Compiler({
    modules,
    frontends,
    refinements,
    workspace: createToolchainWorkspace(options),
  });
}
