import { registerTypeValidatorFacets } from "@narratage/component-kit";
import {
  ModulePackageRegistry,
  NodeCompiler,
} from "@narratage/compiler-node";
import { AuthorFrontendRegistry, installAuthorFrontendHostFacets } from "@narratage/elaborator";
import type { Workspace } from "@narratage/workspace";
import {
  collectNodePackageComponents,
} from "@narratage/package-loader-node";
import type { NodePackageContribution } from "@narratage/package-loader-node";
import {
  createMarkupAuthorFrontend,
  installMarkupSurfaceHostFacets,
  MarkupSurfaceRegistry,
} from "@narratage/markup";
import { TypeValidatorRegistry } from "@narratage/validation";

export type CreateMarkupNodeCompilerOptions = {
  readonly workspace: Workspace;
};

/** Assemble the official Markup authoring environment from already trusted package facets. */
export function createMarkupNodeCompiler(
  packages: readonly NodePackageContribution[],
  options: CreateMarkupNodeCompilerOptions,
): NodeCompiler {
  const modules = new ModulePackageRegistry();
  const surfaces = new MarkupSurfaceRegistry();
  const frontends = new AuthorFrontendRegistry();
  const validators = new TypeValidatorRegistry();
  const components = collectNodePackageComponents(packages);

  for (const item of packages) {
    for (const module of item.modules ?? []) modules.register(module);
    installMarkupSurfaceHostFacets(item.hostFacets ?? [], surfaces);
    installAuthorFrontendHostFacets(item.hostFacets ?? [], frontends);
  }

  for (const component of components) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
  }

  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`No selected author package satisfies ${request.from}`);
      return resolved;
    },
  }));

  return new NodeCompiler({
    modules,
    frontends,
    validators,
    workspace: options.workspace,
  });
}
