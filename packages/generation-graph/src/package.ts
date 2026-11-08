import type { Facet } from "@hypit/facet";
import { isModuleRef } from "@hypit/protocol";

import type {
  GenerationComponentRef,
  GenerationGraphLoweringHost,
  GenerationNodeImplementation,
} from "./types.js";

export const generationNodePackageFacetAbi = "hypit.generation-node-package@1";

export type GenerationNodeDeclaration = Omit<GenerationNodeImplementation, "executionPackage">;

export type GenerationNodePackage = {
  readonly nodes: readonly GenerationNodeDeclaration[];
};

export type GenerationNodePackageFacet = Facet & {
  readonly abi: typeof generationNodePackageFacetAbi;
  readonly implementation: GenerationNodePackage;
};

export type InstalledGenerationNodePackage = {
  readonly specifier: string;
  readonly implementation: GenerationNodePackage;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function generationComponentKey(component: GenerationComponentRef): string {
  assert(isModuleRef(component.module), "Generation Node component Module is invalid.");
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(component.name),
    "Generation Node component name is invalid.");
  return JSON.stringify([component.module.name, component.module.version, component.name]);
}

function assertPackage(value: GenerationNodePackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Generation Node package must be an object.");
  assert(Array.isArray(value.nodes), "Generation Node package nodes must be an array.");
  const keys = new Set<string>();
  for (const node of value.nodes) {
    const key = generationComponentKey(node.using);
    assert(!keys.has(key), `Generation Node package repeats ${key}.`);
    assert(node.fragment?.format === "hypit.fragment@1", `Generation Node ${key} has no Graph Fragment.`);
    keys.add(key);
  }
}

export function createGenerationNodePackageFacet(
  value: GenerationNodePackage,
): GenerationNodePackageFacet {
  assertPackage(value);
  return { abi: generationNodePackageFacetAbi, implementation: value };
}

export function generationNodePackagesFromFacets(
  facets: readonly Facet[],
): readonly GenerationNodePackage[] {
  return facets.flatMap((facet) => facet.abi === generationNodePackageFacetAbi
    ? [(facet as GenerationNodePackageFacet).implementation]
    : []);
}

/** Assemble only installed package implementations. Missing and duplicate components fail exactly. */
export function createGenerationGraphLoweringHost(
  packages: readonly InstalledGenerationNodePackage[],
): GenerationGraphLoweringHost {
  const implementations = new Map<string, GenerationNodeImplementation>();
  for (const installed of packages) {
    assert(installed.specifier.trim().length > 0, "Generation Node package specifier is empty.");
    assertPackage(installed.implementation);
    for (const node of installed.implementation.nodes) {
      const key = generationComponentKey(node.using);
      assert(!implementations.has(key), `Generation Graph Host has multiple implementations for ${key}.`);
      implementations.set(key, {
        ...node,
        executionPackage: installed.specifier,
      });
    }
  }
  return {
    resolveImplementation(node) {
      const key = generationComponentKey(node.using);
      const implementation = implementations.get(key);
      if (implementation === undefined) throw new Error(`Generation Node ${key} is not installed.`);
      return implementation;
    },
  };
}
