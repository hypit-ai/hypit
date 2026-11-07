import type { Facet } from "@hypit/hypit/facet";
import { isModuleRef, moduleKey } from "@hypit/hypit/protocol";

import type {
  NleResolvedAudioEffect,
  NleComponentItem,
  NleEffect,
  NleItem,
  NleLoweringContext,
  NleLoweringHost,
  NleMatte,
  NleMatteLoweringContext,
  NleMedia,
  NleMediaLoweringContext,
  NleResolvedMedia,
  NlePackageSymbol,
  NleResolvedEffect,
  NleResolvedItemSource,
  NleTransition,
  NleTransitionLoweringContext,
} from "./types.js";

export type NleMediaResolver = (
  media: NleMedia,
  context: NleMediaLoweringContext,
) => NleResolvedMedia;

export const nlePackageFacetAbi = "hypit.nle-package@1";

export type NleComponentResolver = {
  readonly component: NlePackageSymbol;
  readonly resolve: (item: NleComponentItem, context: NleLoweringContext) => NleResolvedItemSource;
};

export type NleEffectResolver = {
  readonly effect: NlePackageSymbol;
  readonly resolve: (effect: NleEffect, item: NleItem, context: NleLoweringContext) => NleResolvedEffect;
};

export type NleAudioEffectResolver = {
  readonly effect: NlePackageSymbol;
  readonly resolve: (effect: NleEffect, item: NleItem, context: NleLoweringContext) => NleResolvedAudioEffect;
};

export type NleTransitionResolver = {
  readonly transition: NlePackageSymbol;
  readonly resolve: (transition: NleTransition, context: NleTransitionLoweringContext) => NleResolvedEffect;
};

export type NleMatteResolver = {
  readonly matte: NlePackageSymbol;
  readonly resolve: (matte: NleMatte, context: NleMatteLoweringContext) => NleResolvedEffect;
};

export type NlePackage = {
  readonly components?: readonly NleComponentResolver[];
  readonly effects?: readonly NleEffectResolver[];
  readonly audioEffects?: readonly NleAudioEffectResolver[];
  readonly transitions?: readonly NleTransitionResolver[];
  readonly mattes?: readonly NleMatteResolver[];
};

export type NlePackageFacet = Facet & {
  readonly abi: typeof nlePackageFacetAbi;
  readonly implementation: NlePackage;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function nlePackageSymbolKey(symbol: NlePackageSymbol): string {
  assert(isModuleRef(symbol.module), "NLE package resolver Module is invalid.");
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(symbol.name), "NLE package resolver name is invalid.");
  return `${moduleKey(symbol.module)}#${symbol.name}`;
}

function assertPackage(value: NlePackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "NLE package must be an object.");
  const keys = new Set<string>();
  for (const resolver of value.components ?? []) {
    const key = `component:${nlePackageSymbolKey(resolver.component)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
  for (const resolver of value.effects ?? []) {
    const key = `effect:${nlePackageSymbolKey(resolver.effect)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
  for (const resolver of value.audioEffects ?? []) {
    const key = `audio-effect:${nlePackageSymbolKey(resolver.effect)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
  for (const resolver of value.transitions ?? []) {
    const key = `transition:${nlePackageSymbolKey(resolver.transition)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
  for (const resolver of value.mattes ?? []) {
    const key = `matte:${nlePackageSymbolKey(resolver.matte)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
}

export function createNlePackageFacet(value: NlePackage): NlePackageFacet {
  assertPackage(value);
  return { abi: nlePackageFacetAbi, implementation: value };
}

export function nlePackagesFromFacets(facets: readonly Facet[]): readonly NlePackage[] {
  return facets.flatMap((facet) => facet.abi === nlePackageFacetAbi
    ? [(facet as NlePackageFacet).implementation]
    : []);
}

/** Assemble only explicitly selected installed package contributions. Missing and duplicate symbols fail. */
export function createNleLoweringHost(
  packages: readonly NlePackage[],
  resolveMedia?: NleMediaResolver,
): NleLoweringHost {
  const components = new Map<string, NleComponentResolver>();
  const effects = new Map<string, NleEffectResolver>();
  const audioEffects = new Map<string, NleAudioEffectResolver>();
  const transitions = new Map<string, NleTransitionResolver>();
  const mattes = new Map<string, NleMatteResolver>();
  const add = <T>(registry: Map<string, T>, key: string, value: T) => {
    assert(!registry.has(key), `NLE lowering Host has multiple resolvers for ${key}.`);
    registry.set(key, value);
  };
  for (const value of packages) {
    assertPackage(value);
    for (const resolver of value.components ?? []) add(components, nlePackageSymbolKey(resolver.component), resolver);
    for (const resolver of value.effects ?? []) add(effects, nlePackageSymbolKey(resolver.effect), resolver);
    for (const resolver of value.audioEffects ?? []) {
      add(audioEffects, nlePackageSymbolKey(resolver.effect), resolver);
    }
    for (const resolver of value.transitions ?? []) add(transitions, nlePackageSymbolKey(resolver.transition), resolver);
    for (const resolver of value.mattes ?? []) add(mattes, nlePackageSymbolKey(resolver.matte), resolver);
  }
  return {
    resolveMedia: resolveMedia ?? ((media) => {
      throw new Error(`NLE Media ${media.id} has not been resolved by the Host.`);
    }),
    resolveComponent: (item, context) => {
      const key = nlePackageSymbolKey(item.component);
      const resolver = components.get(key);
      if (resolver === undefined) throw new Error(`NLE Component ${key} is not installed.`);
      return resolver.resolve(item, context);
    },
    resolveEffect: (effect, item, context) => {
      const key = nlePackageSymbolKey(effect.effect);
      const resolver = effects.get(key);
      if (resolver === undefined) throw new Error(`NLE Effect ${key} is not installed.`);
      return resolver.resolve(effect, item, context);
    },
    resolveAudioEffect: (effect, item, context) => {
      const key = nlePackageSymbolKey(effect.effect);
      const resolver = audioEffects.get(key);
      if (resolver === undefined) throw new Error(`NLE Audio Effect ${key} is not installed.`);
      return resolver.resolve(effect, item, context);
    },
    resolveTransition: (transition, context) => {
      const key = nlePackageSymbolKey(transition.operator);
      const resolver = transitions.get(key);
      if (resolver === undefined) throw new Error(`NLE Transition ${key} is not installed.`);
      return resolver.resolve(transition, context);
    },
    resolveMatte: (matte, context) => {
      const key = nlePackageSymbolKey(matte.operator);
      const resolver = mattes.get(key);
      if (resolver === undefined) throw new Error(`NLE Matte ${key} is not installed.`);
      return resolver.resolve(matte, context);
    },
  };
}

export function createNleLoweringHostFromFacets(
  facets: readonly Facet[],
  resolveMedia?: NleMediaResolver,
): NleLoweringHost {
  return createNleLoweringHost(nlePackagesFromFacets(facets), resolveMedia);
}
