import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@narratage/component-kit";
import type {
  ComponentPackage,
  ProducerRegistrar,
} from "@narratage/component-kit";
import { ModulePackageRegistry } from "@narratage/compiler-node";
import type { RegisteredModulePackage } from "@narratage/compiler-node";
import { canonicalize } from "@narratage/protocol";
import type { TypeValidatorRegistrar } from "@narratage/validation";

import type { NodePackageContribution } from "./types.js";

function assertPackage(value: NodePackageContribution): void {
  if (value.format !== "svml.node-package@1") {
    throw new Error(`${value.name || "Node package"} has an unsupported format`);
  }
  if (value.name.trim().length === 0) throw new Error("Node package name must not be empty");
  const hostFacets = new Set<string>();
  for (const facet of value.hostFacets ?? []) {
    if (facet.abi.trim().length === 0) throw new Error(`${value.name} has an empty Host facet ABI`);
    const identity = canonicalize(facet.identity);
    const key = `${facet.abi}:${JSON.stringify(identity)}`;
    if (hostFacets.has(key)) throw new Error(`${value.name} repeats Host facet ${facet.abi}`);
    hostFacets.add(key);
  }
}

export { assertPackage as assertNodePackageContribution };

function facetKey(
  ref: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

/** Verify package-local facet identities before any Host registry receives executable handlers. */
export function collectNodePackageComponents(
  packages: readonly NodePackageContribution[],
): readonly ComponentPackage[] {
  const packageNames = new Set<string>();
  const moduleRegistry = new ModulePackageRegistry();
  const manifests = new Map<string, RegisteredModulePackage>();
  const components = new Map<string, ComponentPackage>();
  const producers = new Set<string>();
  const validators = new Set<string>();
  for (const item of packages) {
    assertPackage(item);
    if (packageNames.has(item.name)) throw new Error(`Node package contribution ${item.name} is listed twice`);
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

export function installNodePackageComponents(
  packages: readonly NodePackageContribution[],
  producers: ProducerRegistrar,
  validators: TypeValidatorRegistrar,
): void {
  for (const component of collectNodePackageComponents(packages)) {
    registerTypeValidatorFacets(validators, component.validators ?? []);
    registerProducerFacets(producers, component.producers ?? []);
  }
}
