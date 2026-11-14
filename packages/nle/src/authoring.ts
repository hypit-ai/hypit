import type { Facet } from "@hypit/facet";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";

import { nlePackageSymbolKey } from "./package.js";
import { indexNleComposition } from "./indexing.js";
import { findNleComponentValue, findNleItem } from "./project.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleAdjustmentItem,
  NleComponentItem,
  NleComponentValue,
  NleMatte,
  NleMediaAssetReference,
  NleOperatorApplication,
  NlePackageSymbol,
  NlePresentItem,
  NleProject,
  NleTrack,
  NleTransition,
} from "./types.js";

export const nleAuthoringFacetKind = "hypit.nle-authoring";

export type NleOperatorApplicationAddress =
  | { readonly kind: "adjustment"; readonly item: string }
  | {
      readonly kind: "occurrence";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly application: string;
    };

export type NleOperatorParameterAuthoringContext = {
  readonly project: NleProject;
  readonly track: NleTrack;
  readonly item: NleAdjustmentItem | NlePresentItem;
  readonly application: NleOperatorApplication;
  readonly address: NleOperatorApplicationAddress;
  readonly medium: "picture" | "audio";
};

export type NleComponentParameterAuthoringContext = {
  readonly project: NleProject;
  readonly item: NleComponentItem;
};

export type NleComponentValueAuthoringContext = {
  readonly project: NleProject;
  readonly value: NleComponentValue;
  /** Current forward-reference users, derived from this exact Project revision. */
  readonly users: readonly { readonly track: NleTrack; readonly item: NleComponentItem }[];
};

/** Package-owned declaration of one project Media role exposed by this exact occurrence. */
export type NleComponentMediaInput = {
  readonly key: string;
  readonly label: string;
  /** Selected Media must provide every listed signal. */
  readonly requires: readonly ("picture" | "audio")[];
  /** Missing input may be authored temporarily, but makes the package resolution incomplete. */
  readonly required: boolean;
};

export type NleComponentMediaInputState = NleComponentMediaInput & {
  readonly asset?: NleMediaAssetReference;
};

/** Whether ordinary NLE source-window edits preserve one package-owned Source or Control clock. */
export type NleOccurrenceTemporalSupport = {
  readonly timeWindow: boolean;
};

export type NleComponentOccurrenceAuthoring = {
  readonly component: NlePackageSymbol;
  readonly temporalSupport: (
    context: NleComponentParameterAuthoringContext,
  ) => NleOccurrenceTemporalSupport;
};

export type NleOperatorOccurrenceAuthoring = {
  readonly operator: NlePackageSymbol;
  readonly temporalSupport: (
    context: NleOperatorParameterAuthoringContext,
  ) => NleOccurrenceTemporalSupport;
};

export type NleTransitionParameterAuthoringContext = {
  readonly project: NleProject;
  readonly transition: NleTransition;
};

export type NleMatteParameterAuthoringContext = {
  readonly project: NleProject;
  readonly matte: NleMatte;
};

/** Package-owned parameter projection and edit semantics for every use of one exact Operator. */
export type NleOperatorParameterAuthoring = {
  readonly operator: NlePackageSymbol;
  readonly inspect: (context: NleOperatorParameterAuthoringContext) => CanonicalValue;
  readonly edit: (
    operation: CanonicalValue,
    context: NleOperatorParameterAuthoringContext,
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

/** Package-owned, potentially dynamic Media roles for one exact Component symbol. */
export type NleComponentMediaAuthoring = {
  readonly component: NlePackageSymbol;
  readonly inputs: (
    context: NleComponentParameterAuthoringContext,
  ) => readonly NleComponentMediaInput[];
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
  readonly componentMedia?: readonly NleComponentMediaAuthoring[];
  readonly operatorParameters?: readonly NleOperatorParameterAuthoring[];
  readonly componentOccurrences?: readonly NleComponentOccurrenceAuthoring[];
  readonly operatorOccurrences?: readonly NleOperatorOccurrenceAuthoring[];
  readonly transitionParameters?: readonly NleTransitionParameterAuthoring[];
  readonly matteParameters?: readonly NleMatteParameterAuthoring[];
};

export type NleAuthoringFacet = Facet & {
  readonly kind: typeof nleAuthoringFacetKind;
  readonly implementation: NleAuthoringPackage;
};

export type NleAuthoringHost = {
  readonly hasComponentParameterAuthoring: (component: NlePackageSymbol) => boolean;
  readonly hasComponentValueAuthoring: (component: NlePackageSymbol, slot: string) => boolean;
  readonly hasComponentMediaAuthoring: (component: NlePackageSymbol) => boolean;
  readonly hasOperatorParameterAuthoring: (operator: NlePackageSymbol) => boolean;
  /** Absence means the package does not promise ordinary source-window edits. */
  readonly occurrenceTemporalSupport: (
    project: NleProject,
    itemId: string,
  ) => NleOccurrenceTemporalSupport | undefined;
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
  readonly inspectComponentMediaInputs: (
    project: NleProject,
    itemId: string,
  ) => readonly NleComponentMediaInputState[];
  readonly planComponentMediaInputSet: (
    project: NleProject,
    itemId: string,
    key: string,
    asset: NleMediaAssetReference,
  ) => NleTransaction;
  readonly planComponentMediaInputRemove: (
    project: NleProject,
    itemId: string,
    key: string,
  ) => NleTransaction;
  readonly inspectOperatorParameters: (
    project: NleProject,
    address: NleOperatorApplicationAddress,
  ) => CanonicalValue;
  readonly planOperatorParameterEdit: (
    project: NleProject,
    address: NleOperatorApplicationAddress,
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
  for (const authoring of value.componentMedia ?? []) {
    const key = nlePackageSymbolKey(authoring.component);
    assert(!keys.has(`component-media:${key}`),
      `NLE authoring package repeats Component Media inputs ${key}.`);
    keys.add(`component-media:${key}`);
    assert(typeof authoring.inputs === "function",
      `NLE Component Media authoring ${key} inputs is not callable.`);
  }
  for (const authoring of value.operatorParameters ?? []) {
    const key = nlePackageSymbolKey(authoring.operator);
    assert(!keys.has(`operator:${key}`), `NLE authoring package repeats Operator parameters ${key}.`);
    keys.add(`operator:${key}`);
    assert(typeof authoring.inspect === "function", `NLE Operator authoring ${key} inspect is not callable.`);
    assert(typeof authoring.edit === "function", `NLE Operator authoring ${key} edit is not callable.`);
  }
  for (const authoring of value.componentOccurrences ?? []) {
    const key = nlePackageSymbolKey(authoring.component);
    assert(!keys.has(`component-occurrence:${key}`),
      `NLE authoring package repeats Component occurrence ${key}.`);
    keys.add(`component-occurrence:${key}`);
    assert(typeof authoring.temporalSupport === "function",
      `NLE Component occurrence authoring ${key} temporalSupport is not callable.`);
  }
  for (const authoring of value.operatorOccurrences ?? []) {
    const key = nlePackageSymbolKey(authoring.operator);
    assert(!keys.has(`operator-occurrence:${key}`),
      `NLE authoring package repeats Operator occurrence ${key}.`);
    keys.add(`operator-occurrence:${key}`);
    assert(typeof authoring.temporalSupport === "function",
      `NLE Operator occurrence authoring ${key} temporalSupport is not callable.`);
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
  const index = indexNleComposition(project);
  return {
    project,
    value: findNleComponentValue(project, valueId),
    users: index.componentValueUsers(valueId).map(({ track, item }) => {
      assert(item.kind === "present" && item.source === "component",
        `NLE Component Value ${valueId} has a non-Component user ${item.id}.`);
      return { track, item };
    }),
  };
}

function componentValueKey(component: NlePackageSymbol, slot: string): string {
  return `${nlePackageSymbolKey(component)}:${slot}`;
}

function componentMediaInputs(
  authoring: NleComponentMediaAuthoring,
  context: NleComponentParameterAuthoringContext,
): readonly NleComponentMediaInput[] {
  const inputs = authoring.inputs(context);
  assert(Array.isArray(inputs), `NLE Component Media inputs for ${context.item.id} must be an array.`);
  const keys = new Set<string>();
  for (const input of inputs) {
    assert(input !== null && typeof input === "object" && !Array.isArray(input),
      `NLE Component Media input for ${context.item.id} is invalid.`);
    assert(Object.keys(input).sort().join("\u0000") === ["key", "label", "required", "requires"].join("\u0000"),
      `NLE Component Media input for ${context.item.id} has invalid fields.`);
    assert(typeof input.key === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(input.key),
      `NLE Component Media input key for ${context.item.id} is invalid.`);
    assert(!keys.has(input.key), `NLE Component ${context.item.id} repeats Media input ${input.key}.`);
    keys.add(input.key);
    assert(typeof input.label === "string" && input.label.trim().length > 0,
      `NLE Component Media input ${input.key} label is empty.`);
    assert(typeof input.required === "boolean",
      `NLE Component Media input ${input.key} required state is invalid.`);
    assert(Array.isArray(input.requires) && input.requires.length > 0
      && input.requires.every((signal: "picture" | "audio") => signal === "picture" || signal === "audio")
      && new Set(input.requires).size === input.requires.length,
    `NLE Component Media input ${input.key} signal requirements are invalid.`);
  }
  return structuredClone(inputs);
}

function locateOperatorApplication(
  project: NleProject,
  address: NleOperatorApplicationAddress,
): NleOperatorParameterAuthoringContext {
  const { item, track } = findNleItem(project, address.item);
  if (address.kind === "adjustment") {
    if (item.kind !== "adjustment") throw new Error(`NLE Item ${address.item} is not an Adjustment.`);
    return { project, track, item, application: item, address, medium: track.kind };
  }
  if (item.kind !== "present") throw new Error(`NLE Item ${address.item} is not a Present.`);
  const appearance = address.medium === "picture" ? item.picture : item.audio;
  const application = appearance?.operators?.find((candidate) => candidate.id === address.application);
  if (application === undefined) {
    throw new Error(`Unknown NLE ${address.medium} Operator Application ${address.application} on Item ${address.item}.`);
  }
  return { project, track, item, application, address, medium: address.medium };
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
  return { kind: nleAuthoringFacetKind, implementation: value };
}

export function nleAuthoringPackagesFromFacets(facets: readonly Facet[]): readonly NleAuthoringPackage[] {
  return facets.flatMap((facet) => facet.kind === nleAuthoringFacetKind
    ? [(facet as NleAuthoringFacet).implementation]
    : []);
}

export function createNleAuthoringHost(packages: readonly NleAuthoringPackage[]): NleAuthoringHost {
  const components = new Map<string, NleComponentParameterAuthoring>();
  const componentValues = new Map<string, NleComponentValueAuthoring>();
  const componentMedia = new Map<string, NleComponentMediaAuthoring>();
  const operators = new Map<string, NleOperatorParameterAuthoring>();
  const componentOccurrences = new Map<string, NleComponentOccurrenceAuthoring>();
  const operatorOccurrences = new Map<string, NleOperatorOccurrenceAuthoring>();
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
    for (const authoring of value.componentMedia ?? []) {
      const key = nlePackageSymbolKey(authoring.component);
      assert(!componentMedia.has(key),
        `NLE authoring Host has multiple Component Media input owners for ${key}.`);
      componentMedia.set(key, authoring);
    }
    for (const authoring of value.operatorParameters ?? []) {
      const key = nlePackageSymbolKey(authoring.operator);
      assert(!operators.has(key), `NLE authoring Host has multiple Operator parameter owners for ${key}.`);
      operators.set(key, authoring);
    }
    for (const authoring of value.componentOccurrences ?? []) {
      const key = nlePackageSymbolKey(authoring.component);
      assert(!componentOccurrences.has(key),
        `NLE authoring Host has multiple Component occurrence owners for ${key}.`);
      componentOccurrences.set(key, authoring);
    }
    for (const authoring of value.operatorOccurrences ?? []) {
      const key = nlePackageSymbolKey(authoring.operator);
      assert(!operatorOccurrences.has(key),
        `NLE authoring Host has multiple Operator occurrence owners for ${key}.`);
      operatorOccurrences.set(key, authoring);
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
  const resolveComponentMedia = (
    context: NleComponentParameterAuthoringContext,
  ): NleComponentMediaAuthoring => {
    const key = nlePackageSymbolKey(context.item.component);
    const authoring = componentMedia.get(key);
    if (authoring === undefined) throw new Error(`NLE Component Media authoring ${key} is not installed.`);
    return authoring;
  };
  const resolveOperator = (
    context: NleOperatorParameterAuthoringContext,
  ): NleOperatorParameterAuthoring => {
    const key = nlePackageSymbolKey(context.application.operator);
    const authoring = operators.get(key);
    if (authoring === undefined) throw new Error(`NLE Operator parameter authoring ${key} is not installed.`);
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
    hasComponentMediaAuthoring: (component) => componentMedia.has(nlePackageSymbolKey(component)),
    hasOperatorParameterAuthoring: (operator) => operators.has(nlePackageSymbolKey(operator)),
    occurrenceTemporalSupport: (project, itemId) => {
      const found = findNleItem(project, itemId);
      const validate = (support: NleOccurrenceTemporalSupport | undefined, label: string) => {
        if (support === undefined) return undefined;
        assert(support !== null && typeof support === "object" && !Array.isArray(support)
          && Object.keys(support).every((key) => key === "timeWindow")
          && typeof support.timeWindow === "boolean",
        `NLE occurrence temporal support for ${label} is invalid.`);
        return support;
      };
      if (found.item.kind === "adjustment") {
        const context: NleOperatorParameterAuthoringContext = {
          project,
          track: found.track,
          item: found.item,
          application: found.item,
          address: { kind: "adjustment", item: found.item.id },
          medium: found.track.kind,
        };
        return structuredClone(validate(operatorOccurrences.get(nlePackageSymbolKey(found.item.operator))
          ?.temporalSupport(context), itemId));
      }
      const sourceSupport = found.item.source === "media" || found.item.source === "composition"
        ? { timeWindow: true }
        : validate(componentOccurrences.get(nlePackageSymbolKey(found.item.component))?.temporalSupport({
            project, item: found.item,
          }), itemId);
      if (sourceSupport?.timeWindow !== true) return structuredClone(sourceSupport);
      const applications = [
        ...(found.item.picture?.operators ?? []).map((application) => ({
          application, medium: "picture" as const,
        })),
        ...(found.item.audio?.operators ?? []).map((application) => ({
          application, medium: "audio" as const,
        })),
      ];
      for (const { application, medium } of applications) {
        const address: NleOperatorApplicationAddress = {
          kind: "occurrence", item: found.item.id, medium, application: application.id,
        };
        const support = validate(operatorOccurrences.get(nlePackageSymbolKey(application.operator))
          ?.temporalSupport({
            project,
            track: found.track,
            item: found.item,
            application,
            address,
            medium,
          }), `${itemId}/${application.id}`);
        if (support?.timeWindow !== true) return support === undefined ? undefined : structuredClone(support);
      }
      return { timeWindow: true };
    },
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
    inspectComponentMediaInputs: (project, itemId) => {
      const context = locateComponent(project, itemId);
      return componentMediaInputs(resolveComponentMedia(context), context).map((input) => ({
        ...input,
        ...(context.item.media?.[input.key] === undefined
          ? {}
          : { asset: structuredClone(context.item.media[input.key]) }),
      }));
    },
    planComponentMediaInputSet: (project, itemId, key, asset) => {
      const context = locateComponent(project, itemId);
      const inputs = componentMediaInputs(resolveComponentMedia(context), context);
      assert(inputs.some((input) => input.key === key),
        `NLE Component ${itemId} does not declare Media input ${key}.`);
      return {
        revision: project.revision,
        commands: [{
          kind: "item.replace",
          item: {
            ...structuredClone(context.item),
            media: { ...structuredClone(context.item.media ?? {}), [key]: structuredClone(asset) },
          },
        }],
      };
    },
    planComponentMediaInputRemove: (project, itemId, key) => {
      const context = locateComponent(project, itemId);
      const inputs = componentMediaInputs(resolveComponentMedia(context), context);
      assert(inputs.some((input) => input.key === key) || context.item.media?.[key] !== undefined,
        `NLE Component ${itemId} has no Media input ${key}.`);
      const media = structuredClone(context.item.media ?? {}) as Record<string, NleMediaAssetReference>;
      delete media[key];
      const { media: _media, ...withoutMedia } = structuredClone(context.item);
      const item: NleComponentItem = Object.keys(media).length === 0
        ? withoutMedia
        : { ...withoutMedia, media };
      return { revision: project.revision, commands: [{ kind: "item.replace", item }] };
    },
    inspectOperatorParameters: (project, address) => {
      const context = locateOperatorApplication(project, address);
      return canonicalize(resolveOperator(context).inspect(context));
    },
    planOperatorParameterEdit: (project, address, operation) => {
      const context = locateOperatorApplication(project, address);
      const parameters = canonicalize(resolveOperator(context).edit(canonicalize(operation), context));
      return {
        revision: project.revision,
        commands: [address.kind === "adjustment" ? {
          kind: "item.replace",
          item: { ...structuredClone(context.item), parameters },
        } : {
          kind: "operator-application.replace",
          item: address.item,
          medium: address.medium,
          application: { ...structuredClone(context.application), parameters },
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
