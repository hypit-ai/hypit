import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@svml/component-kit";
import type {
  ComponentPackage,
  ProducerRegistrar,
} from "@svml/component-kit";
import {
  ModulePackageRegistry,
  NodeCompiler,
} from "@svml/compiler-node";
import type { RegisteredModulePackage } from "@svml/compiler-node";
import { AuthorFrontendRegistry } from "@svml/elaborator";
import type { Workspace } from "@svml/host";
import { isDigest } from "@svml/protocol";
import {
  createTextAuthorFrontend,
  TextSurfaceRegistry,
  textAuthorFrontendId,
} from "@svml/text";
import { TypeValidatorRegistry } from "@svml/validation";
import type { TypeValidatorRegistrar } from "@svml/validation";

import type { NodePackageActivation } from "./types.js";

export type CreateActivatedNodeCompilerOptions = {
  readonly root?: string;
  readonly workspace?: Workspace;
};

function assertPackage(value: NodePackageActivation): void {
  if (value.format !== "svml.node-package@1") {
    throw new Error(`${value.name || "Node package"} has an unsupported format`);
  }
  if (value.name.trim().length === 0) throw new Error("Node package name must not be empty");
}

function facetKey(
  ref: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

/** Verify package-local facet identities before any Host registry receives executable handlers. */
export function nodePackageComponents(
  packages: readonly NodePackageActivation[],
): readonly ComponentPackage[] {
  const packageNames = new Set<string>();
  const moduleRegistry = new ModulePackageRegistry();
  const manifests = new Map<string, RegisteredModulePackage>();
  const components = new Map<string, ComponentPackage>();
  const producers = new Set<string>();
  const validators = new Set<string>();
  for (const item of packages) {
    assertPackage(item);
    if (packageNames.has(item.name)) throw new Error(`Node package ${item.name} is activated twice`);
    packageNames.add(item.name);
    for (const module of item.modules ?? []) {
      const key = `${module.manifest.name}@${module.manifest.version}`;
      if (manifests.has(key)) throw new Error(`Node packages repeat Module ${key}`);
      moduleRegistry.register(module);
      manifests.set(key, module);
    }
    for (const component of item.components ?? []) {
      if (component.name.trim().length === 0) throw new Error(`${item.name} has an empty Component name`);
      if (components.has(component.name)) throw new Error(`Node packages repeat Component ${component.name}`);
      components.set(component.name, component);
      for (const producer of component.producers ?? []) {
        const key = facetKey(producer.producer);
        if (producers.has(key)) throw new Error(`Node packages repeat Producer facet ${key}`);
        producers.add(key);
      }
      for (const validator of component.validators ?? []) {
        const key = facetKey(validator.type);
        if (validators.has(key)) throw new Error(`Node packages repeat Type Validator facet ${key}`);
        validators.add(key);
      }
    }
  }
  for (const component of components.values()) {
    for (const facet of component.producers ?? []) {
      const manifest = manifests.get(`${facet.producer.module.name}@${facet.producer.module.version}`)?.manifest;
      const declaration = manifest?.producers.find((item) => item.name === facet.producer.name);
      if (declaration === undefined) throw new Error(`${component.name} implements undeclared Producer ${facetKey(facet.producer)}`);
      if (declaration.implementation.digest !== facet.implementationDigest) {
        throw new Error(`${component.name} Producer ${facetKey(facet.producer)} differs from its Manifest`);
      }
    }
    for (const facet of component.validators ?? []) {
      const manifest = manifests.get(`${facet.type.module.name}@${facet.type.module.version}`)?.manifest;
      const declaration = manifest?.types.find((item) => item.name === facet.type.name);
      if (declaration?.validator === undefined) throw new Error(`${component.name} validates undeclared Type ${facetKey(facet.type)}`);
      if (declaration.validator.implementation.digest !== facet.implementationDigest) {
        throw new Error(`${component.name} Type Validator ${facetKey(facet.type)} differs from its Manifest`);
      }
    }
  }
  return [...components.values()];
}

export function activateNodeComponents(
  packages: readonly NodePackageActivation[],
  producers: ProducerRegistrar,
  validators: TypeValidatorRegistrar,
): void {
  for (const component of nodePackageComponents(packages)) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(producers, component.producers ?? []);
  }
}

/** Assemble already trusted author facets without knowing any domain component by name. */
export function createActivatedNodeCompiler(
  packages: readonly NodePackageActivation[],
  options: CreateActivatedNodeCompilerOptions = {},
): NodeCompiler {
  const names = new Set<string>();
  const modules = new ModulePackageRegistry();
  const surfaces = new TextSurfaceRegistry();
  const frontends = new AuthorFrontendRegistry();
  const validators = new TypeValidatorRegistry();

  for (const item of packages) {
    assertPackage(item);
    if (names.has(item.name)) throw new Error(`Node package ${item.name} is activated twice`);
    names.add(item.name);
    for (const module of item.modules ?? []) modules.register(module);
    for (const surface of item.textSurfaces ?? []) {
      if (!isDigest(surface.implementationDigest)) {
        throw new Error(`${item.name} Surface ${surface.surface} has an invalid implementation digest`);
      }
      if (surface.mode === "raw") {
        surfaces.registerRaw(
          surface.module,
          surface.surface,
          surface.implementationDigest,
          surface.handler,
        );
      } else {
        surfaces.registerStructured(
          surface.module,
          surface.surface,
          surface.implementationDigest,
          surface.handler,
        );
      }
    }
    for (const frontend of item.frontends ?? []) frontends.register(frontend);
  }

  for (const component of nodePackageComponents(packages)) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
  }

  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`No activated author package satisfies ${request.from}`);
      return resolved;
    },
  }));

  return new NodeCompiler({
    modules,
    frontends,
    validators,
    entryFrontend: textAuthorFrontendId,
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(options.workspace === undefined ? {} : { workspace: options.workspace }),
  });
}
