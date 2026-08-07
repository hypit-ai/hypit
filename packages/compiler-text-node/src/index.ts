import { registerTypeValidatorFacets } from "@svml/component-kit";
import {
  ModulePackageRegistry,
  NodeCompiler,
} from "@svml/compiler-node";
import { AuthorFrontendRegistry } from "@svml/elaborator";
import type { Workspace } from "@svml/host";
import {
  assertNodePackageContribution,
  collectNodePackageComponents,
} from "@svml/package-loader-node";
import type { NodePackageContribution } from "@svml/package-loader-node";
import {
  createTextAuthorFrontend,
  installTextSurfaceHostFacets,
  TextSurfaceRegistry,
  textAuthorFrontendId,
} from "@svml/text";
import { TypeValidatorRegistry } from "@svml/validation";

export type CreateTextNodeCompilerOptions = {
  readonly root?: string;
  readonly workspace?: Workspace;
};

/** Assemble the official Text authoring environment from already trusted package facets. */
export function createTextNodeCompiler(
  packages: readonly NodePackageContribution[],
  options: CreateTextNodeCompilerOptions = {},
): NodeCompiler {
  const names = new Set<string>();
  const modules = new ModulePackageRegistry();
  const surfaces = new TextSurfaceRegistry();
  const frontends = new AuthorFrontendRegistry();
  const validators = new TypeValidatorRegistry();

  for (const item of packages) {
    assertNodePackageContribution(item);
    if (names.has(item.name)) throw new Error(`Node package contribution ${item.name} is listed twice`);
    names.add(item.name);
    for (const module of item.modules ?? []) modules.register(module);
    installTextSurfaceHostFacets(item.hostFacets ?? [], surfaces);
    for (const frontend of item.authorFrontends ?? []) frontends.register(frontend);
  }

  for (const component of collectNodePackageComponents(packages)) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
  }

  frontends.register(createTextAuthorFrontend({
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
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(options.workspace === undefined ? {} : { workspace: options.workspace }),
  });
}
