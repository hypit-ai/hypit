import type { Facet } from "@hypit/facet";
import { isModuleRef, moduleKey } from "@hypit/module";

import type {
  NleResolvedAudioOperator,
  NleComponentLoweringContext,
  NleComponentItem,
  NleLoweringContext,
  NleLoweringHost,
  NleMatte,
  NleMatteLoweringContext,
  NleMediaAssetReference,
  NleMediaLoweringContext,
  NleOperatorApplication,
  NleOperatorLoweringContext,
  NleResolvedMedia,
  NlePackageSymbol,
  NleResolvedPictureOperator,
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

export const nlePackageFacetKind = "hypit.nle-package";

export type NleComponentResolver = {
  readonly component: NlePackageSymbol;
  readonly resolve: (
    item: NleComponentItem,
    context: NleComponentLoweringContext,
  ) => NleResolvedItemSource;
};

export type NlePictureOperatorResolver = {
  readonly operator: NlePackageSymbol;
  readonly resolve: (
    application: NleOperatorApplication,
    context: NleOperatorLoweringContext,
  ) => NleResolvedPictureOperator;
};

export type NleAudioOperatorResolver = {
  readonly operator: NlePackageSymbol;
  readonly resolve: (
    application: NleOperatorApplication,
    context: NleOperatorLoweringContext,
  ) => NleResolvedAudioOperator;
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
  readonly resolve: (transition: NleTransition, context: NleTransitionLoweringContext) => NleResolvedPictureOperator;
};

export type NleMatteResolver = {
  readonly matte: NlePackageSymbol;
  readonly resolve: (matte: NleMatte, context: NleMatteLoweringContext) => NleResolvedPictureOperator;
};

export type NlePackage = {
  readonly components?: readonly NleComponentResolver[];
  readonly pictureOperators?: readonly NlePictureOperatorResolver[];
  readonly audioOperators?: readonly NleAudioOperatorResolver[];
  readonly signalReconstructions?: readonly NleSignalReconstructionResolver[];
  readonly transitions?: readonly NleTransitionResolver[];
  readonly mattes?: readonly NleMatteResolver[];
};

export type NlePackageFacet = Facet & {
  readonly kind: typeof nlePackageFacetKind;
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
  for (const resolver of value.pictureOperators ?? []) {
    const key = `picture-operator:${nlePackageSymbolKey(resolver.operator)}`;
    assert(!keys.has(key), `NLE package repeats resolver ${key}.`);
    keys.add(key);
    assert(typeof resolver.resolve === "function", `NLE resolver ${key} is not callable.`);
  }
  for (const resolver of value.audioOperators ?? []) {
    const key = `audio-operator:${nlePackageSymbolKey(resolver.operator)}`;
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
  return { kind: nlePackageFacetKind, implementation: value };
}

export function nlePackagesFromFacets(facets: readonly Facet[]): readonly NlePackage[] {
  return facets.flatMap((facet) => facet.kind === nlePackageFacetKind
    ? [(facet as NlePackageFacet).implementation]
    : []);
}

/** Assemble only explicitly selected installed package contributions. Missing and duplicate symbols fail. */
export function createNleLoweringHost(
  packages: readonly NlePackage[],
  resolveMedia?: NleMediaResolver,
): NleLoweringHost {
  const components = new Map<string, NleComponentResolver>();
  const pictureOperators = new Map<string, NlePictureOperatorResolver>();
  const audioOperators = new Map<string, NleAudioOperatorResolver>();
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
    for (const resolver of value.pictureOperators ?? []) {
      add(pictureOperators, nlePackageSymbolKey(resolver.operator), resolver);
    }
    for (const resolver of value.audioOperators ?? []) {
      add(audioOperators, nlePackageSymbolKey(resolver.operator), resolver);
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
    resolvePictureOperator: (application, context) => {
      const key = nlePackageSymbolKey(application.operator);
      const resolver = pictureOperators.get(key);
      if (resolver === undefined) throw new Error(`NLE Picture Operator ${key} is not installed.`);
      return resolver.resolve(application, context);
    },
    resolveAudioOperator: (application, context) => {
      const key = nlePackageSymbolKey(application.operator);
      const resolver = audioOperators.get(key);
      if (resolver === undefined) throw new Error(`NLE Audio Operator ${key} is not installed.`);
      return resolver.resolve(application, context);
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
