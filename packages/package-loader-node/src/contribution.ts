import {
  registerProducerFacets,
  registerTypeValidatorFacets,
} from "@narratage/component-kit";
import type {
  ComponentPackage,
  ProducerRegistrar,
  TypeValidatorRegistrar,
} from "@narratage/component-kit";
import { canonicalize } from "@narratage/protocol";

import type { NodeModuleContribution, NodePackageContribution } from "./types.js";

function assertPackage(value: NodePackageContribution): void {
  if (value.format !== "svml.node-package@1") {
    throw new Error("Node package contribution has an unsupported format");
  }
  const hostFacets = new Set<string>();
  for (const facet of value.hostFacets ?? []) {
    if (facet.abi.trim().length === 0) throw new Error("Node package contribution has an empty Host facet ABI");
    const offers = facet.offers ?? [];
    if (offers.some((item) => item.trim().length === 0)) {
      throw new Error(`Node package contribution has an empty logical name for Host facet ${facet.abi}`);
    }
    if (new Set(offers).size !== offers.length) {
      throw new Error(`Node package contribution repeats a logical name for Host facet ${facet.abi}`);
    }
    const identity = facet.identity === undefined ? undefined : canonicalize(facet.identity);
    const key = `${facet.abi}:${JSON.stringify([...offers].sort())}:${identity === undefined ? "" : JSON.stringify(identity)}`;
    if (hostFacets.has(key)) throw new Error(`Node package contribution repeats Host facet ${facet.abi}`);
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
  const manifests = new Map<string, NodeModuleContribution>();
  const moduleSpecifiers = new Map<string, string>();
  const components: ComponentPackage[] = [];
  const producers = new Set<string>();
  const validators = new Set<string>();
  for (const item of packages) {
    assertPackage(item);
    for (const module of item.modules ?? []) {
      const key = `${module.manifest.name}@${module.manifest.version}`;
      if (manifests.has(key)) throw new Error(`Node packages repeat Module ${key}`);
      for (const specifier of new Set([key, ...(module.specifiers ?? [])])) {
        if (specifier.trim().length === 0) throw new Error(`${key} declares an empty Module specifier`);
        const owner = moduleSpecifiers.get(specifier);
        if (owner !== undefined) throw new Error(`Module specifier ${specifier} is already bound to ${owner}`);
        moduleSpecifiers.set(specifier, key);
      }
      manifests.set(key, module);
    }
    for (const component of item.components ?? []) {
      components.push(component);
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
  for (const component of components) {
    for (const facet of component.producers ?? []) {
      const manifest = manifests.get(`${facet.producer.module.name}@${facet.producer.module.version}`)?.manifest;
      const declaration = manifest?.producers.find((item) => item.name === facet.producer.name);
      if (declaration === undefined) throw new Error(`Module ${facet.producer.module.name} implements undeclared Producer ${facetKey(facet.producer)}`);
      if (declaration.implementation.digest !== facet.implementationDigest) {
        throw new Error(`Producer ${facetKey(facet.producer)} differs from its Manifest`);
      }
    }
    for (const facet of component.validators ?? []) {
      const manifest = manifests.get(`${facet.type.module.name}@${facet.type.module.version}`)?.manifest;
      const declaration = manifest?.types.find((item) => item.name === facet.type.name);
      if (declaration?.validator === undefined) throw new Error(`Module ${facet.type.module.name} validates undeclared Type ${facetKey(facet.type)}`);
      if (declaration.validator.implementation.digest !== facet.implementationDigest) {
        throw new Error(`Type Validator ${facetKey(facet.type)} differs from its Manifest`);
      }
    }
  }
  return components;
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
