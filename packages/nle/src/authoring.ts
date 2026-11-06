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
  NlePackageSymbol,
  NlePictureAppearance,
  NleProject,
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

export type NleAuthoringPackage = {
  readonly componentParameters?: readonly NleComponentParameterAuthoring[];
  readonly effectParameters?: readonly NleEffectParameterAuthoring[];
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
  const audioEffect = item.kind === "caption"
    ? undefined
    : item.audio?.effects.find((candidate) => candidate.id === effectId);
  if (pictureEffect !== undefined) return { project, item, effect: pictureEffect, medium: "picture" };
  if (audioEffect !== undefined) return { project, item, effect: audioEffect, medium: "audio" };
  throw new Error(`Unknown NLE Effect ${itemId}.${effectId}.`);
}

function replaceEffectParameters(
  item: NleItem,
  effectId: string,
  parameters: CanonicalValue,
): NleItem {
  const next = structuredClone(item) as NleItem;
  const appearances = [next.picture, next.kind === "caption" ? undefined : next.audio]
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
  };
}

export function createNleAuthoringHostFromFacets(facets: readonly Facet[]): NleAuthoringHost {
  return createNleAuthoringHost(nleAuthoringPackagesFromFacets(facets));
}
