import type { CliCompilerOptions } from "@hypit/hypit/cli";
import { refinementPackagesFromFacets, registerTypeRefinements, RefinementRegistry } from "@hypit/hypit/refinement";
import { ModulePackageRegistry, Compiler } from "@hypit/hypit/compiler";
import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  installAuthorDeclarationFacets,
  installAuthorFrontendFacets,
} from "@hypit/hypit/author";
import { createSvmlAuthorFrontend } from "@hypit/hypit/svml";
import { svmlAuthorFrontendId } from "@hypit/hypit/svml";
import {
  resolveNodePackageResourceSpecifier,
  resolveNodePackageSource,
} from "@hypit/hypit/loader/node";
import { NodeFilesystemWorkspace } from "@hypit/hypit/workspace/node";

export function createToolchainWorkspace(options: Pick<CliCompilerOptions,
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
export function createToolchainCompiler(options: CliCompilerOptions) {
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
