import type { ComponentPackage } from "@narratage/component-kit";
import { canonicalize } from "@narratage/protocol";

import type { NodeModuleContribution, NodePackageContribution } from "./types.js";

function assertPackage(value: NodePackageContribution): void {
  if (value.format !== "narratage.node-package@1") {
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
  const declarations = new Set<string>();
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
      for (const producer of module.manifest.producers) {
        declarations.add(`${key}#producer:${producer.name}`);
      }
      for (const type of module.manifest.types) {
        declarations.add(`${key}#type:${type.name}`);
      }
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
      const key = `${facet.producer.module.name}@${facet.producer.module.version}#producer:${facet.producer.name}`;
      if (!declarations.has(key)) throw new Error(`Module ${facet.producer.module.name} implements undeclared Producer ${facetKey(facet.producer)}`);
    }
    for (const facet of component.validators ?? []) {
      const key = `${facet.type.module.name}@${facet.type.module.version}#type:${facet.type.name}`;
      if (!declarations.has(key)) throw new Error(`Module ${facet.type.module.name} validates undeclared Type ${facetKey(facet.type)}`);
    }
  }
  return components;
}
