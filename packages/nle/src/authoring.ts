import type { Facet } from "@hypit/facet";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";

import { nlePackageSymbolKey } from "./package.js";
import { findNleItem } from "./project.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleComponentItem,
  NleEffect,
  NleItem,
  NleMatte,
  NlePackageSymbol,
  NlePictureAppearance,
  NleProject,
  NleTransition,
} from "./types.js";

export const nleAuthoringFacetAbi = "hypit.nle-authoring@1";

export type NleEffectParameterAuthoringContext = {
  readonly project: NleProject;
  readonly item: NleItem;
  readonly effect: NleEffect;
  readonly medium: "picture" | "audio";
};

export type NleComponentParameterAuthoringContext = {
  readonly project: NleProject;
  readonly item: NleComponentItem;
};

export type NleTransitionParameterAuthoringContext = {
  readonly project: NleProject;
  readonly transition: NleTransition;
};

export type NleMatteParameterAuthoringContext = {
  readonly project: NleProject;
  readonly matte: NleMatte;
};

/** Package-owned parameter projection and edit semantics for one exact Effect symbol. */
export type NleEffectParameterAuthoring = {
  readonly effect: NlePackageSymbol;
  readonly inspect: (context: NleEffectParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: NleEffectParameterAuthoringContext,
  ) => CanonicalValue;
};

/** Package-owned parameter projection and edit semantics for one exact Component symbol. */
export type NleComponentParameterAuthoring = {
  readonly component: NlePackageSymbol;
  readonly inspect: (context: NleComponentParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: NleComponentParameterAuthoringContext,
  ) => CanonicalValue;
};

/** Package-owned parameter projection and edit semantics for one exact Transition symbol. */
export type NleTransitionParameterAuthoring = {
  readonly transition: NlePackageSymbol;
  readonly inspect: (context: NleTransitionParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: NleTransitionParameterAuthoringContext,
  ) => CanonicalValue;
};

/** Package-owned parameter projection and edit semantics for one exact Matte symbol. */
export type NleMatteParameterAuthoring = {
  readonly matte: NlePackageSymbol;
  readonly inspect: (context: NleMatteParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: NleMatteParameterAuthoringContext,
  ) => CanonicalValue;
};

export type NleAuthoringPackage = {
  readonly componentParameters?: readonly NleComponentParameterAuthoring[];
  readonly effectParameters?: readonly NleEffectParameterAuthoring[];
  readonly transitionParameters?: readonly NleTransitionParameterAuthoring[];
  readonly matteParameters?: readonly NleMatteParameterAuthoring[];
};

export type NleAuthoringFacet = Facet & {
  readonly abi: typeof nleAuthoringFacetAbi;
  readonly implementation: NleAuthoringPackage;
};

export type NleAuthoringHost = {
  readonly inspectComponentParameters: (
    project: NleProject,
    itemId: string,
  ) => CanonicalValue;
  readonly planComponentParameterEdit: (
    project: NleProject,
    itemId: string,
    operation: CanonicalValue,
  ) => NleTransaction;
  readonly inspectEffectParameters: (
    project: NleProject,
    itemId: string,
    effectId: string,
  ) => CanonicalValue;
  readonly planEffectParameterEdit: (
    project: NleProject,
    itemId: string,
    effectId: string,
    operation: CanonicalValue,
  ) => NleTransaction;
  readonly inspectTransitionParameters: (
    project: NleProject,
    transitionId: string,
  ) => CanonicalValue;
  readonly planTransitionParameterEdit: (
    project: NleProject,
    transitionId: string,
    operation: CanonicalValue,
  ) => NleTransaction;
  readonly inspectMatteParameters: (
    project: NleProject,
    matteId: string,
  ) => CanonicalValue;
  readonly planMatteParameterEdit: (
    project: NleProject,
    matteId: string,
    operation: CanonicalValue,
  ) => NleTransaction;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPackage(value: NleAuthoringPackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "NLE authoring package must be an object.");
  const keys = new Set<string>();
  for (const authoring of value.componentParameters ?? []) {
    const key = nlePackageSymbolKey(authoring.component);
    assert(!keys.has(`component:${key}`), `NLE authoring package repeats Component parameters ${key}.`);
    keys.add(`component:${key}`);
    assert(typeof authoring.inspect === "function", `NLE Component authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `NLE Component authoring ${key} edit is not callable.`);
  }
  for (const authoring of value.effectParameters ?? []) {
    const key = nlePackageSymbolKey(authoring.effect);
    assert(!keys.has(`effect:${key}`), `NLE authoring package repeats Effect parameters ${key}.`);
    keys.add(`effect:${key}`);
    assert(typeof authoring.inspect === "function", `NLE Effect authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `NLE Effect authoring ${key} edit is not callable.`);
  }
  for (const authoring of value.transitionParameters ?? []) {
    const key = nlePackageSymbolKey(authoring.transition);
    assert(!keys.has(`transition:${key}`), `NLE authoring package repeats Transition parameters ${key}.`);
    keys.add(`transition:${key}`);
    assert(typeof authoring.inspect === "function", `NLE Transition authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `NLE Transition authoring ${key} edit is not callable.`);
  }
  for (const authoring of value.matteParameters ?? []) {
    const key = nlePackageSymbolKey(authoring.matte);
    assert(!keys.has(`matte:${key}`), `NLE authoring package repeats Matte parameters ${key}.`);
    keys.add(`matte:${key}`);
    assert(typeof authoring.inspect === "function", `NLE Matte authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `NLE Matte authoring ${key} edit is not callable.`);
  }
}

function locateComponent(project: NleProject, itemId: string): NleComponentParameterAuthoringContext {
  const { item } = findNleItem(project, itemId);
  if (item.kind !== "component") throw new Error(`NLE Item ${itemId} is not a Component.`);
  return { project, item };
}

function locateEffect(
  project: NleProject,
  itemId: string,
  effectId: string,
): NleEffectParameterAuthoringContext {
  const { item } = findNleItem(project, itemId);
  const pictureEffect = item.picture?.effects.find((candidate) => candidate.id === effectId);
  const audioEffect = item.audio?.effects.find((candidate) => candidate.id === effectId);
  if (pictureEffect !== undefined) return { project, item, effect: pictureEffect, medium: "picture" };
  if (audioEffect !== undefined) return { project, item, effect: audioEffect, medium: "audio" };
  throw new Error(`Unknown NLE Effect ${itemId}.${effectId}.`);
}

function locateTransition(project: NleProject, transitionId: string): NleTransitionParameterAuthoringContext {
  const transition = project.transitions.find((candidate) => candidate.id === transitionId);
  if (transition === undefined) throw new Error(`Unknown NLE Transition ${transitionId}.`);
  return { project, transition };
}

function locateMatte(project: NleProject, matteId: string): NleMatteParameterAuthoringContext {
  const matte = project.mattes.find((candidate) => candidate.id === matteId);
  if (matte === undefined) throw new Error(`Unknown NLE Matte ${matteId}.`);
  return { project, matte };
}

function replaceEffectParameters(
  item: NleItem,
  effectId: string,
  parameters: CanonicalValue,
): NleItem {
  const next = structuredClone(item) as NleItem;
  const appearances = [next.picture, next.audio]
    .filter((value): value is NlePictureAppearance | { readonly effects: readonly NleEffect[] } => value !== undefined);
  const appearance = appearances.find((value) => value.effects.some((candidate) => candidate.id === effectId));
  if (appearance === undefined) throw new Error(`Unknown NLE Effect ${item.id}.${effectId}.`);
  const effects = appearance.effects as NleEffect[];
  const index = effects.findIndex((candidate) => candidate.id === effectId);
  effects.splice(index, 1, { ...effects[index]!, parameters });
  return next;
}

export function createNleAuthoringFacet(value: NleAuthoringPackage): NleAuthoringFacet {
  assertPackage(value);
  return { abi: nleAuthoringFacetAbi, implementation: value };
}

export function nleAuthoringPackagesFromFacets(facets: readonly Facet[]): readonly NleAuthoringPackage[] {
  return facets.flatMap((facet) => facet.abi === nleAuthoringFacetAbi
    ? [(facet as NleAuthoringFacet).implementation]
    : []);
}

export function createNleAuthoringHost(packages: readonly NleAuthoringPackage[]): NleAuthoringHost {
  const components = new Map<string, NleComponentParameterAuthoring>();
  const effects = new Map<string, NleEffectParameterAuthoring>();
  const transitions = new Map<string, NleTransitionParameterAuthoring>();
  const mattes = new Map<string, NleMatteParameterAuthoring>();
  for (const value of packages) {
    assertPackage(value);
    for (const authoring of value.componentParameters ?? []) {
      const key = nlePackageSymbolKey(authoring.component);
      assert(!components.has(key), `NLE authoring Host has multiple Component parameter owners for ${key}.`);
      components.set(key, authoring);
    }
    for (const authoring of value.effectParameters ?? []) {
      const key = nlePackageSymbolKey(authoring.effect);
      assert(!effects.has(key), `NLE authoring Host has multiple Effect parameter owners for ${key}.`);
      effects.set(key, authoring);
    }
    for (const authoring of value.transitionParameters ?? []) {
      const key = nlePackageSymbolKey(authoring.transition);
      assert(!transitions.has(key), `NLE authoring Host has multiple Transition parameter owners for ${key}.`);
      transitions.set(key, authoring);
    }
    for (const authoring of value.matteParameters ?? []) {
      const key = nlePackageSymbolKey(authoring.matte);
      assert(!mattes.has(key), `NLE authoring Host has multiple Matte parameter owners for ${key}.`);
      mattes.set(key, authoring);
    }
  }
  const resolveComponent = (context: NleComponentParameterAuthoringContext): NleComponentParameterAuthoring => {
    const key = nlePackageSymbolKey(context.item.component);
    const authoring = components.get(key);
    if (authoring === undefined) throw new Error(`NLE Component parameter authoring ${key} is not installed.`);
    return authoring;
  };
  const resolveEffect = (context: NleEffectParameterAuthoringContext): NleEffectParameterAuthoring => {
    const key = nlePackageSymbolKey(context.effect.effect);
    const authoring = effects.get(key);
    if (authoring === undefined) throw new Error(`NLE Effect parameter authoring ${key} is not installed.`);
    return authoring;
  };
  const resolveTransition = (
    context: NleTransitionParameterAuthoringContext,
  ): NleTransitionParameterAuthoring => {
    const key = nlePackageSymbolKey(context.transition.operator);
    const authoring = transitions.get(key);
    if (authoring === undefined) throw new Error(`NLE Transition parameter authoring ${key} is not installed.`);
    return authoring;
  };
  const resolveMatte = (context: NleMatteParameterAuthoringContext): NleMatteParameterAuthoring => {
    const key = nlePackageSymbolKey(context.matte.operator);
    const authoring = mattes.get(key);
    if (authoring === undefined) throw new Error(`NLE Matte parameter authoring ${key} is not installed.`);
    return authoring;
  };
  return {
    inspectComponentParameters: (project, itemId) => {
      const context = locateComponent(project, itemId);
      return canonicalize(resolveComponent(context).inspect(context));
    },
    planComponentParameterEdit: (project, itemId, operation) => {
      const context = locateComponent(project, itemId);
      const parameters = canonicalize(resolveComponent(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "item.replace",
          item: { ...structuredClone(context.item), parameters },
        }],
      };
    },
    inspectEffectParameters: (project, itemId, effectId) => {
      const context = locateEffect(project, itemId, effectId);
      return canonicalize(resolveEffect(context).inspect(context));
    },
    planEffectParameterEdit: (project, itemId, effectId, operation) => {
      const context = locateEffect(project, itemId, effectId);
      const parameters = canonicalize(resolveEffect(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "item.replace",
          item: replaceEffectParameters(context.item, effectId, parameters),
        }],
      };
    },
    inspectTransitionParameters: (project, transitionId) => {
      const context = locateTransition(project, transitionId);
      return canonicalize(resolveTransition(context).inspect(context));
    },
    planTransitionParameterEdit: (project, transitionId, operation) => {
      const context = locateTransition(project, transitionId);
      const parameters = canonicalize(resolveTransition(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "transition.replace",
          transition: { ...structuredClone(context.transition), parameters },
        }],
      };
    },
    inspectMatteParameters: (project, matteId) => {
      const context = locateMatte(project, matteId);
      return canonicalize(resolveMatte(context).inspect(context));
    },
    planMatteParameterEdit: (project, matteId, operation) => {
      const context = locateMatte(project, matteId);
      const parameters = canonicalize(resolveMatte(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "matte.replace",
          matte: { ...structuredClone(context.matte), parameters },
        }],
      };
    },
  };
}

export function createNleAuthoringHostFromFacets(facets: readonly Facet[]): NleAuthoringHost {
  return createNleAuthoringHost(nleAuthoringPackagesFromFacets(facets));
}
