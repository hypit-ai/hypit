import type { BuildCliCompilerOptions } from "@hypit/build-cli";
import { generationModulesFromFacets } from "@hypit/generation-build";
import { refinementPackagesFromFacets, registerTypeRefinements, RefinementRegistry } from "@hypit/refinement";
import { ModulePackageRegistry, Compiler } from "@hypit/generation-authoring/compiler";
import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  installAuthorDeclarationFacets,
  installAuthorFrontendFacets,
} from "@hypit/generation-authoring/author";
import { createSvmlAuthorFrontend } from "@hypit/svml";
import { svmlAuthorFrontendId } from "@hypit/svml";
import {
  resolveNodePackageResourceSpecifier,
  resolveNodePackageSource,
} from "@hypit/loader/node";
import { NodeFilesystemWorkspace } from "@hypit/generation-authoring/workspace/node";
import { modulesFromFacets } from "@hypit/module";

export function createSvmlToolchainWorkspace(options: Pick<BuildCliCompilerOptions,
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

/** Assemble the optional SVML compiler from only the packages selected for this compilation. */
export function createSvmlToolchainCompiler(options: BuildCliCompilerOptions) {
  const modules = new ModulePackageRegistry();
  const declarations = new AuthorDeclarationRegistry();
  const frontends = new AuthorFrontendRegistry();
  const refinements = new RefinementRegistry();
  for (const item of options.packageContributions) {
    const facets = item.facets ?? [];
    for (const manifest of modulesFromFacets(facets)) modules.register({ manifest });
    for (const declaration of generationModulesFromFacets(facets)) modules.registerGeneration(declaration);
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
    workspace: createSvmlToolchainWorkspace(options),
  });
}
