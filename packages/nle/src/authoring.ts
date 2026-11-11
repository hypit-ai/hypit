import type { Facet } from "@hypit/facet";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";

import { nlePackageSymbolKey } from "./package.js";
import { findNleComponentValue, findNleItem } from "./project.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleAdjustmentItem,
  NleComponentItem,
  NleComponentValue,
  NleMatte,
  NlePackageSymbol,
  NleProject,
  NleTransition,
} from "./types.js";

export const nleAuthoringFacetAbi = "hypit.nle-authoring@1";

export type NleAdjustmentParameterAuthoringContext = {
  readonly project: NleProject;
  readonly item: NleAdjustmentItem;
  readonly medium: "picture" | "audio";
};

export type NleComponentParameterAuthoringContext = {
  readonly project: NleProject;
  readonly item: NleComponentItem;
};

export type NleComponentValueAuthoringContext = {
  readonly project: NleProject;
  readonly value: NleComponentValue;
};

export type NleTransitionParameterAuthoringContext = {
  readonly project: NleProject;
  readonly transition: NleTransition;
};

export type NleMatteParameterAuthoringContext = {
  readonly project: NleProject;
  readonly matte: NleMatte;
};

/** Package-owned parameter projection and edit semantics for one exact Adjustment Component. */
export type NleAdjustmentParameterAuthoring = {
  readonly component: NlePackageSymbol;
  readonly inspect: (context: NleAdjustmentParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: NleAdjustmentParameterAuthoringContext,
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

/** Package-owned semantics for one exact shared Component slot value. */
export type NleComponentValueAuthoring = {
  readonly component: NlePackageSymbol;
  readonly slot: string;
  readonly inspect: (context: NleComponentValueAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: NleComponentValueAuthoringContext,
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
  readonly componentValues?: readonly NleComponentValueAuthoring[];
  readonly adjustmentParameters?: readonly NleAdjustmentParameterAuthoring[];
  readonly transitionParameters?: readonly NleTransitionParameterAuthoring[];
  readonly matteParameters?: readonly NleMatteParameterAuthoring[];
};

export type NleAuthoringFacet = Facet & {
  readonly abi: typeof nleAuthoringFacetAbi;
  readonly implementation: NleAuthoringPackage;
};

export type NleAuthoringHost = {
  readonly hasComponentParameterAuthoring: (component: NlePackageSymbol) => boolean;
  readonly hasComponentValueAuthoring: (component: NlePackageSymbol, slot: string) => boolean;
  readonly hasAdjustmentParameterAuthoring: (component: NlePackageSymbol) => boolean;
  readonly inspectComponentParameters: (
    project: NleProject,
    itemId: string,
  ) => CanonicalValue;
  readonly planComponentParameterEdit: (
    project: NleProject,
    itemId: string,
    operation: CanonicalValue,
  ) => NleTransaction;
  readonly inspectComponentValue: (
    project: NleProject,
    valueId: string,
  ) => CanonicalValue;
  readonly planComponentValueEdit: (
    project: NleProject,
    valueId: string,
    operation: CanonicalValue,
  ) => NleTransaction;
  readonly inspectAdjustmentParameters: (
    project: NleProject,
    itemId: string,
  ) => CanonicalValue;
  readonly planAdjustmentParameterEdit: (
    project: NleProject,
    itemId: string,
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
  for (const authoring of value.componentValues ?? []) {
    assert(typeof authoring.slot === "string" && authoring.slot.length > 0,
      "NLE Component value authoring slot is invalid.");
    const key = `${nlePackageSymbolKey(authoring.component)}:${authoring.slot}`;
    assert(!keys.has(`component-value:${key}`), `NLE authoring package repeats Component value ${key}.`);
    keys.add(`component-value:${key}`);
    assert(typeof authoring.inspect === "function", `NLE Component value authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `NLE Component value authoring ${key} edit is not callable.`);
  }
  for (const authoring of value.adjustmentParameters ?? []) {
    const key = nlePackageSymbolKey(authoring.component);
    assert(!keys.has(`adjustment:${key}`), `NLE authoring package repeats Adjustment parameters ${key}.`);
    keys.add(`adjustment:${key}`);
    assert(typeof authoring.inspect === "function", `NLE Adjustment authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `NLE Adjustment authoring ${key} edit is not callable.`);
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
  if (item.kind !== "present" || item.source !== "component") {
    throw new Error(`NLE Item ${itemId} is not a Component Present.`);
  }
  return { project, item };
}

function locateComponentValue(project: NleProject, valueId: string): NleComponentValueAuthoringContext {
  return { project, value: findNleComponentValue(project, valueId) };
}

function componentValueKey(component: NlePackageSymbol, slot: string): string {
  return `${nlePackageSymbolKey(component)}:${slot}`;
}

function locateAdjustment(
  project: NleProject,
  itemId: string,
): NleAdjustmentParameterAuthoringContext {
  const { item, track } = findNleItem(project, itemId);
  if (item.kind !== "adjustment") throw new Error(`NLE Item ${itemId} is not an Adjustment.`);
  return { project, item, medium: track.kind };
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
  const componentValues = new Map<string, NleComponentValueAuthoring>();
  const adjustments = new Map<string, NleAdjustmentParameterAuthoring>();
  const transitions = new Map<string, NleTransitionParameterAuthoring>();
  const mattes = new Map<string, NleMatteParameterAuthoring>();
  for (const value of packages) {
    assertPackage(value);
    for (const authoring of value.componentParameters ?? []) {
      const key = nlePackageSymbolKey(authoring.component);
      assert(!components.has(key), `NLE authoring Host has multiple Component parameter owners for ${key}.`);
      components.set(key, authoring);
    }
    for (const authoring of value.componentValues ?? []) {
      const key = componentValueKey(authoring.component, authoring.slot);
      assert(!componentValues.has(key), `NLE authoring Host has multiple Component value owners for ${key}.`);
      componentValues.set(key, authoring);
    }
    for (const authoring of value.adjustmentParameters ?? []) {
      const key = nlePackageSymbolKey(authoring.component);
      assert(!adjustments.has(key), `NLE authoring Host has multiple Adjustment parameter owners for ${key}.`);
      adjustments.set(key, authoring);
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
  const resolveComponentValue = (context: NleComponentValueAuthoringContext): NleComponentValueAuthoring => {
    const key = componentValueKey(context.value.component, context.value.slot);
    const authoring = componentValues.get(key);
    if (authoring === undefined) throw new Error(`NLE Component value authoring ${key} is not installed.`);
    return authoring;
  };
  const resolveAdjustment = (
    context: NleAdjustmentParameterAuthoringContext,
  ): NleAdjustmentParameterAuthoring => {
    const key = nlePackageSymbolKey(context.item.component);
    const authoring = adjustments.get(key);
    if (authoring === undefined) throw new Error(`NLE Adjustment parameter authoring ${key} is not installed.`);
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
    hasComponentParameterAuthoring: (component) => components.has(nlePackageSymbolKey(component)),
    hasComponentValueAuthoring: (component, slot) => componentValues.has(componentValueKey(component, slot)),
    hasAdjustmentParameterAuthoring: (component) => adjustments.has(nlePackageSymbolKey(component)),
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
    inspectComponentValue: (project, valueId) => {
      const context = locateComponentValue(project, valueId);
      return canonicalize(resolveComponentValue(context).inspect(context));
    },
    planComponentValueEdit: (project, valueId, operation) => {
      const context = locateComponentValue(project, valueId);
      const value = canonicalize(resolveComponentValue(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "component-value.replace",
          value: { ...structuredClone(context.value), value },
        }],
      };
    },
    inspectAdjustmentParameters: (project, itemId) => {
      const context = locateAdjustment(project, itemId);
      return canonicalize(resolveAdjustment(context).inspect(context));
    },
    planAdjustmentParameterEdit: (project, itemId, operation) => {
      const context = locateAdjustment(project, itemId);
      const parameters = canonicalize(resolveAdjustment(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [{
          kind: "item.replace",
          item: { ...structuredClone(context.item), parameters },
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
