import type { Facet } from "@hypit/facet";
import { isModuleRef, moduleKey } from "@hypit/protocol";

import type {
  SceneBehaviorResolverContext,
  SceneLoweringHost,
  SceneResolvedBehavior,
} from "./motion.js";
import type { ScenePackageSymbol, ScenePerformanceItem } from "./types.js";

export const scenePackageFacetAbi = "hypit.scene-package@1";

export type SceneBehaviorResolver = {
  readonly behavior: ScenePackageSymbol;
  readonly resolve: (
    item: ScenePerformanceItem,
    context: SceneBehaviorResolverContext,
  ) => SceneResolvedBehavior;
};

export type ScenePackage = {
  readonly behaviors?: readonly SceneBehaviorResolver[];
};

export type ScenePackageFacet = Facet & {
  readonly abi: typeof scenePackageFacetAbi;
  readonly implementation: ScenePackage;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function scenePackageSymbolKey(symbol: ScenePackageSymbol): string {
  assert(isModuleRef(symbol.module), "Scene package resolver Module is invalid.");
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(symbol.name), "Scene package resolver name is invalid.");
  return `${moduleKey(symbol.module)}#${symbol.name}`;
}

function assertPackage(value: ScenePackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Scene package must be an object.");
  const keys = new Set<string>();
  for (const resolver of value.behaviors ?? []) {
    const key = scenePackageSymbolKey(resolver.behavior);
    assert(!keys.has(key), `Scene package repeats Behavior resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `Scene Behavior resolver ${key} is not callable.`);
  }
}

export function createScenePackageFacet(value: ScenePackage): ScenePackageFacet {
  assertPackage(value);
  return { abi: scenePackageFacetAbi, implementation: value };
}

export function scenePackagesFromFacets(facets: readonly Facet[]): readonly ScenePackage[] {
  return facets.flatMap((facet) => facet.abi === scenePackageFacetAbi
    ? [(facet as ScenePackageFacet).implementation]
    : []);
}

export function createSceneLoweringHost(packages: readonly ScenePackage[]): SceneLoweringHost {
  const behaviors = new Map<string, SceneBehaviorResolver>();
  for (const value of packages) {
    assertPackage(value);
    for (const resolver of value.behaviors ?? []) {
      const key = scenePackageSymbolKey(resolver.behavior);
      assert(!behaviors.has(key), `Scene lowering Host has multiple resolvers for ${key}.`);
      behaviors.set(key, resolver);
    }
  }
  return {
    resolveBehavior: (item, context) => {
      const key = scenePackageSymbolKey(item.using);
      const resolver = behaviors.get(key);
      if (resolver === undefined) throw new Error(`Scene Behavior ${key} is not installed.`);
      return resolver.resolve(item, context);
    },
  };
}

export function createSceneLoweringHostFromFacets(facets: readonly Facet[]): SceneLoweringHost {
  return createSceneLoweringHost(scenePackagesFromFacets(facets));
}
