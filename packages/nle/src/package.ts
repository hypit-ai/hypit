import type { Facet } from "@hypit/facet";
import { isModuleRef, moduleKey } from "@hypit/protocol";

import type {
  NleResolvedAudioAdjustment,
  NleAdjustmentItem,
  NleComponentItem,
  NleLoweringContext,
  NleLoweringHost,
  NleMatte,
  NleMatteLoweringContext,
  NleMediaAssetReference,
  NleMediaLoweringContext,
  NleResolvedMedia,
  NlePackageSymbol,
  NleResolvedPictureAdjustment,
  NleResolvedItemSource,
  NleResolvedSignalReconstruction,
  NleAudioAppearance,
  NleTransition,
  NleTransitionLoweringContext,
  NlePresentItem,
} from "./types.js";

export type NleMediaResolver = (
  asset: NleMediaAssetReference,
  context: NleMediaLoweringContext,
) => NleResolvedMedia;

export const nlePackageFacetAbi = "hypit.nle-package@1";

export type NleComponentResolver = {
  readonly component: NlePackageSymbol;
  readonly resolve: (
    item: NleComponentItem,
    context: NleLoweringContext,
  ) => NleResolvedItemSource;
};

export type NlePictureAdjustmentResolver = {
  readonly component: NlePackageSymbol;
  readonly resolve: (item: NleAdjustmentItem, context: NleLoweringContext) => NleResolvedPictureAdjustment;
};

export type NleAudioAdjustmentResolver = {
  readonly component: NlePackageSymbol;
  readonly resolve: (item: NleAdjustmentItem, context: NleLoweringContext) => NleResolvedAudioAdjustment;
};

export type NleSignalReconstructionResolver = {
  readonly reconstruction: NlePackageSymbol;
  readonly resolve: (
    reconstruction: NonNullable<NleAudioAppearance["reconstruction"]>,
    item: NlePresentItem,
    context: NleLoweringContext,
  ) => NleResolvedSignalReconstruction;
};

export type NleTransitionResolver = {
  readonly transition: NlePackageSymbol;
  readonly resolve: (transition: NleTransition, context: NleTransitionLoweringContext) => NleResolvedPictureAdjustment;
};

export type NleMatteResolver = {
  readonly matte: NlePackageSymbol;
  readonly resolve: (matte: NleMatte, context: NleMatteLoweringContext) => NleResolvedPictureAdjustment;
};

export type NlePackage = {
  readonly components?: readonly NleComponentResolver[];
  readonly pictureAdjustments?: readonly NlePictureAdjustmentResolver[];
  readonly audioAdjustments?: readonly NleAudioAdjustmentResolver[];
  readonly signalReconstructions?: readonly NleSignalReconstructionResolver[];
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
  for (const resolver of value.pictureAdjustments ?? []) {
    const key = `picture-adjustment:${nlePackageSymbolKey(resolver.component)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
  for (const resolver of value.audioAdjustments ?? []) {
    const key = `audio-adjustment:${nlePackageSymbolKey(resolver.component)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
  for (const resolver of value.signalReconstructions ?? []) {
    const key = `signal-reconstruction:${nlePackageSymbolKey(resolver.reconstruction)}`;
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
  const pictureAdjustments = new Map<string, NlePictureAdjustmentResolver>();
  const audioAdjustments = new Map<string, NleAudioAdjustmentResolver>();
  const signalReconstructions = new Map<string, NleSignalReconstructionResolver>();
  const transitions = new Map<string, NleTransitionResolver>();
  const mattes = new Map<string, NleMatteResolver>();
  const add = <T>(registry: Map<string, T>, key: string, value: T) => {
    assert(!registry.has(key), `NLE lowering Host has multiple resolvers for ${key}.`);
    registry.set(key, value);
  };
  for (const value of packages) {
    assertPackage(value);
    for (const resolver of value.components ?? []) add(components, nlePackageSymbolKey(resolver.component), resolver);
    for (const resolver of value.pictureAdjustments ?? []) {
      add(pictureAdjustments, nlePackageSymbolKey(resolver.component), resolver);
    }
    for (const resolver of value.audioAdjustments ?? []) {
      add(audioAdjustments, nlePackageSymbolKey(resolver.component), resolver);
    }
    for (const resolver of value.signalReconstructions ?? []) {
      add(signalReconstructions, nlePackageSymbolKey(resolver.reconstruction), resolver);
    }
    for (const resolver of value.transitions ?? []) add(transitions, nlePackageSymbolKey(resolver.transition), resolver);
    for (const resolver of value.mattes ?? []) add(mattes, nlePackageSymbolKey(resolver.matte), resolver);
  }
  return {
    resolveMedia: resolveMedia ?? ((asset) => {
      throw new Error(`NLE Media Asset ${asset.path} has not been resolved by the Host.`);
    }),
    resolveComponent: (item, context) => {
      const key = nlePackageSymbolKey(item.component);
      const resolver = components.get(key);
      if (resolver === undefined) throw new Error(`NLE Component ${key} is not installed.`);
      return resolver.resolve(item, context);
    },
    resolvePictureAdjustment: (item, context) => {
      const key = nlePackageSymbolKey(item.component);
      const resolver = pictureAdjustments.get(key);
      if (resolver === undefined) throw new Error(`NLE Picture Adjustment ${key} is not installed.`);
      return resolver.resolve(item, context);
    },
    resolveAudioAdjustment: (item, context) => {
      const key = nlePackageSymbolKey(item.component);
      const resolver = audioAdjustments.get(key);
      if (resolver === undefined) throw new Error(`NLE Audio Adjustment ${key} is not installed.`);
      return resolver.resolve(item, context);
    },
    resolveSignalReconstruction: (reconstruction, item, context) => {
      const key = nlePackageSymbolKey(reconstruction.using);
      const resolver = signalReconstructions.get(key);
      if (resolver === undefined) throw new Error(`NLE Signal Reconstruction ${key} is not installed.`);
      return resolver.resolve(reconstruction, item, context);
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
