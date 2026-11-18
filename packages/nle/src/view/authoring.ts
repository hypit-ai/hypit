import { assertImplementationBinding, type PackageSymbol } from "../implementation.js";
import { indexNleProject } from "../indexing.js";
import {
  findNleComponentSharedValue,
  findNleOperatorSharedValue,
  resolveNleComponentValue,
} from "../project.js";
import type {
  NleAdjustItem,
  NleComponentItem,
  NleComponentSharedValue,
  NleComponentValueBinding,
  NleComposition,
  NleMediaInterpretation,
  NleMediaReference,
  NleProcess,
  NlePresentItem,
  NleProject,
  NleTrack,
  NleTransition,
} from "../types.js";
import type { NleTransaction } from "../transaction.js";
import type { NleSourceTimeBounds } from "../source-time.js";
import { assertExactTemporalValue, compareExactTemporalValues, exactTemporalZero } from "@hypit/temporal/algebra";
import { assertContributionOwner, packageSymbolKey } from "./symbol.js";

export const nleAuthoringContributionKind = "hypit.nle-authoring";

export type NleComponentAuthoringContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly item: NleComponentItem;
};

/** One package-owned Media role in the current Component occurrence. */
export type NleComponentMediaInput = {
  readonly slot: string;
  readonly label: string;
  readonly required: boolean;
  readonly picture?: "any" | "constant" | "signal";
  readonly audio?: true;
};

export function acceptsNleComponentMedia(input: NleComponentMediaInput, interpretation: NleMediaInterpretation): boolean {
  return (input.picture === undefined
    || (interpretation.picture !== undefined && (input.picture === "any" || input.picture === interpretation.picture.kind)))
    && (input.audio !== true || interpretation.audio !== undefined);
}

export type NleProcessAuthoringContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly item: NlePresentItem | NleAdjustItem;
  readonly process: NleProcess;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly scope:
    | { readonly kind: "adjust" }
    | { readonly kind: "occurrence"; readonly medium: "picture" | "audio" };
};

export type NleTransitionAuthoringContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly transition: NleTransition;
};

export type NleTransitionAuthoring = {
  readonly operator: PackageSymbol;
  readonly editParameters: (operation: unknown, context: NleTransitionAuthoringContext) => Readonly<Record<string, unknown>>;
};

export type NleComponentValueAuthoringContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly item: NleComponentItem;
  readonly slot: string;
  readonly binding: NleComponentValueBinding;
  readonly value: Readonly<Record<string, unknown>>;
  readonly sharedValue?: NleComponentSharedValue;
  /** The occurrence for inline ownership, or all current users for shared ownership. */
  readonly users: readonly {
    readonly composition: NleComposition;
    readonly track: NleTrack;
    readonly item: NleComponentItem;
  }[];
};

export type NleComponentAuthoring = {
  readonly component: PackageSymbol;
  /** Whether the Component supports ordinary NLE time-window edits. */
  readonly timeWindow?: (context: NleComponentAuthoringContext) => boolean;
  /** Readable source coordinates, independent of the Item's current placement. */
  readonly sourceTime?: (context: NleComponentAuthoringContext) => NleSourceTimeBounds;
  /** Package-owned parameter operation. The returned closed parameters replace this occurrence's parameters. */
  readonly editParameters?: (
    operation: unknown,
    context: NleComponentAuthoringContext,
  ) => Readonly<Record<string, unknown>>;
  readonly mediaInputs?: (context: NleComponentAuthoringContext) => readonly NleComponentMediaInput[];
};

export type NleOperatorTemporalAuthoring = {
  readonly operator: PackageSymbol;
  /** Whether ordinary trim and split preserve this Process by slicing only its existing Control relation. */
  readonly timeWindow?: (context: NleProcessAuthoringContext) => boolean;
  readonly editParameters?: (
    operation: unknown,
    context: NleProcessAuthoringContext,
  ) => Readonly<Record<string, unknown>>;
};

/** Package-owned editing semantics for one exact reusable Component slot. */
export type NleComponentValueAuthoring = {
  readonly component: PackageSymbol;
  readonly slot: string;
  readonly editValue: (
    operation: unknown,
    context: NleComponentValueAuthoringContext,
  ) => Readonly<Record<string, unknown>>;
};

export type NleProcessAddress =
  | { readonly kind: "adjust"; readonly item: string }
  | {
      readonly kind: "occurrence";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly process: string;
    };

/** One explicitly selected npm package's process-local NLE authoring contribution. */
export type NleAuthoringContribution = {
  readonly kind: typeof nleAuthoringContributionKind;
  readonly package: string;
  readonly components: readonly NleComponentAuthoring[];
  readonly componentValues: readonly NleComponentValueAuthoring[];
  readonly operators: readonly NleOperatorTemporalAuthoring[];
  readonly transitions?: readonly NleTransitionAuthoring[];
};

export type NleAuthoringHost = {
  readonly componentTimeWindow: (context: NleComponentAuthoringContext) => boolean | undefined;
  readonly componentSourceTime: (context: NleComponentAuthoringContext) => NleSourceTimeBounds | undefined;
  readonly componentMediaInputs: (context: NleComponentAuthoringContext) => readonly NleComponentMediaInput[];
  readonly operatorTimeWindow: (context: NleProcessAuthoringContext) => boolean | undefined;
  readonly hasComponentParameterAuthoring: (component: PackageSymbol) => boolean;
  readonly hasComponentValueAuthoring: (component: PackageSymbol, slot: string) => boolean;
  readonly hasOperatorParameterAuthoring: (operator: PackageSymbol) => boolean;
  readonly hasTransitionParameterAuthoring: (operator: PackageSymbol) => boolean;
  readonly planTransitionParameterEdit: (context: NleTransitionAuthoringContext, operation: unknown) => NleTransaction;
  readonly planComponentParameterEdit: (
    context: NleComponentAuthoringContext,
    operation: unknown,
  ) => NleTransaction;
  readonly planProcessParameterEdit: (
    context: NleProcessAuthoringContext,
    address: NleProcessAddress,
    operation: unknown,
  ) => NleTransaction;
  readonly planComponentValueEdit: (
    context: NleComponentValueAuthoringContext,
    operation: unknown,
  ) => NleTransaction;
};

export function createNleComponentAuthoringContext(
  project: NleProject,
  itemId: string,
): NleComponentAuthoringContext {
  const located = indexNleProject(project).item(itemId);
  if (located === undefined || located.item.kind !== "present" || located.item.source !== "component") {
    throw new Error(`NLE Item ${itemId} is not a Component Present.`);
  }
  return { project, ...located, item: located.item };
}

export function planNleComponentMediaEdit(
  authoring: NleAuthoringHost,
  context: NleComponentAuthoringContext,
  slot: string,
  binding?: { readonly asset: NleMediaReference; readonly interpretation: NleMediaInterpretation },
): NleTransaction {
  const { item } = context;
  const input = authoring.componentMediaInputs(context).find(entry => entry.slot === slot);
  if (input === undefined) throw new Error(`NLE Component ${item.id} does not declare Media input ${slot}.`);
  if (binding !== undefined && !acceptsNleComponentMedia(input, binding.interpretation)) {
    throw new Error(`NLE Media ${binding.asset.path} does not satisfy Component ${item.id} input ${slot}.`);
  }
  if (item.media?.[slot]?.path === binding?.asset.path) return { commands: [] };
  const { media: existing, ...occurrence } = structuredClone(item);
  const media = { ...existing };
  if (binding === undefined) delete media[slot];
  else media[slot] = structuredClone(binding.asset);
  return { commands: [{ kind: "item.replace", item: { ...occurrence, ...(Object.keys(media).length === 0 ? {} : { media }) } }] };
}

function componentValueKey(component: PackageSymbol, slot: string): string {
  return `${packageSymbolKey(component)}:${slot}`;
}

export function createNleComponentValueAuthoringContext(
  project: NleProject,
  itemId: string,
  slot: string,
): NleComponentValueAuthoringContext {
  const index = indexNleProject(project);
  const { composition, track, item } = createNleComponentAuthoringContext(project, itemId);
  const binding = item.valueBindings?.find((candidate) => candidate.slot === slot);
  if (binding === undefined) throw new Error(`NLE Component ${itemId} has no value slot ${slot}.`);
  const sharedValue = binding.kind === "shared" ? findNleComponentSharedValue(project, binding.ref) : undefined;
  const users = (sharedValue === undefined
    ? [{ composition, track, item }]
    : index.sharedValueUsers(sharedValue.id)).map(({ composition: userComposition, track: userTrack, item: userItem }) => {
    const candidate = userItem;
    if (candidate.kind !== "present" || candidate.source !== "component") {
      throw new Error(`NLE Component value ${slot} has non-Component user ${candidate.id}.`);
    }
    return { composition: userComposition, track: userTrack, item: candidate };
  });
  return {
    project, composition, track, item, slot, binding: structuredClone(binding),
    value: resolveNleComponentValue(project, item.component, binding),
    ...(sharedValue === undefined ? {} : { sharedValue }),
    users,
  };
}

function assertContribution(value: NleAuthoringContribution): void {
  if (value === null || typeof value !== "object") {
    throw new Error("NLE authoring contribution must be an object.");
  }
  if (!Array.isArray(value.components) || !Array.isArray(value.componentValues)
    || !Array.isArray(value.operators) || (value.transitions !== undefined && !Array.isArray(value.transitions))) {
    throw new Error("NLE authoring contribution declarations must be arrays.");
  }
  assertContributionOwner(value.package, [
    ...value.components.map((entry) => entry.component),
    ...value.componentValues.map((entry) => entry.component),
    ...value.operators.map((entry) => entry.operator),
    ...(value.transitions ?? []).map(entry => entry.operator),
  ], "NLE authoring contribution");
  const keys = new Set<string>();
  for (const entry of value.components) {
    const key = `component:${packageSymbolKey(entry.component)}`;
    if (keys.has(key)) throw new Error(`NLE authoring contribution repeats ${key}.`);
    keys.add(key);
    if (entry.timeWindow !== undefined && typeof entry.timeWindow !== "function") {
      throw new Error(`NLE authoring contribution ${key} timeWindow is not callable.`);
    }
    if (entry.sourceTime !== undefined && typeof entry.sourceTime !== "function") {
      throw new Error(`NLE authoring contribution ${key} sourceTime is not callable.`);
    }
    if (entry.editParameters !== undefined && typeof entry.editParameters !== "function") {
      throw new Error(`NLE authoring contribution ${key} editParameters is not callable.`);
    }
    if (entry.mediaInputs !== undefined && typeof entry.mediaInputs !== "function") {
      throw new Error(`NLE authoring contribution ${key} mediaInputs is not callable.`);
    }
  }
  for (const entry of value.operators) {
    const key = `operator:${packageSymbolKey(entry.operator)}`;
    if (keys.has(key)) throw new Error(`NLE authoring contribution repeats ${key}.`);
    keys.add(key);
    if (entry.timeWindow !== undefined && typeof entry.timeWindow !== "function") {
      throw new Error(`NLE authoring contribution ${key} timeWindow is not callable.`);
    }
    if (entry.editParameters !== undefined && typeof entry.editParameters !== "function") {
      throw new Error(`NLE authoring contribution ${key} editParameters is not callable.`);
    }
  }
  for (const entry of value.transitions ?? []) {
    const key = `transition:${packageSymbolKey(entry.operator)}`;
    if (keys.has(key)) throw new Error(`NLE authoring contribution repeats ${key}.`);
    keys.add(key);
    if (typeof entry.editParameters !== "function") throw new Error(`NLE authoring contribution ${key} editParameters is not callable.`);
  }
  for (const entry of value.componentValues) {
    if (!/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(entry.slot)) {
      throw new Error("NLE Component value authoring slot is invalid.");
    }
    const key = `component-value:${componentValueKey(entry.component, entry.slot)}`;
    if (keys.has(key)) throw new Error(`NLE authoring contribution repeats ${key}.`);
    keys.add(key);
    if (typeof entry.editValue !== "function") {
      throw new Error(`NLE authoring contribution ${key} editValue is not callable.`);
    }
  }
}

export function createNleAuthoringContribution(value: {
  readonly package: string;
  readonly components?: readonly NleComponentAuthoring[];
  readonly componentValues?: readonly NleComponentValueAuthoring[];
  readonly operators?: readonly NleOperatorTemporalAuthoring[];
  readonly transitions?: readonly NleTransitionAuthoring[];
}): NleAuthoringContribution {
  const contribution: NleAuthoringContribution = {
    kind: nleAuthoringContributionKind,
    package: value.package,
    components: [...(value.components ?? [])],
    componentValues: [...(value.componentValues ?? [])],
    operators: [...(value.operators ?? [])],
    ...(value.transitions === undefined ? {} : { transitions: [...value.transitions] }),
  };
  assertContribution(contribution);
  return contribution;
}

/** Assemble only caller-selected installed contributions; missing and duplicate symbols stay observable. */
export function createNleAuthoringHost(
  contributions: readonly NleAuthoringContribution[],
): NleAuthoringHost {
  const components = new Map<string, NleComponentAuthoring>();
  const componentValues = new Map<string, NleComponentValueAuthoring>();
  const operators = new Map<string, NleOperatorTemporalAuthoring>();
  const transitions = new Map<string, NleTransitionAuthoring>();
  for (const contribution of contributions) {
    assertContribution(contribution);
    for (const entry of contribution.components) {
      const key = packageSymbolKey(entry.component);
      if (components.has(key)) throw new Error(`NLE authoring Host has multiple Component declarations for ${key}.`);
      components.set(key, entry);
    }
    for (const entry of contribution.operators) {
      const key = packageSymbolKey(entry.operator);
      if (operators.has(key)) throw new Error(`NLE authoring Host has multiple Operator declarations for ${key}.`);
      operators.set(key, entry);
    }
    for (const entry of contribution.transitions ?? []) {
      const key = packageSymbolKey(entry.operator);
      if (transitions.has(key)) throw new Error(`NLE authoring Host has multiple Transition declarations for ${key}.`);
      transitions.set(key, entry);
    }
    for (const entry of contribution.componentValues) {
      const key = componentValueKey(entry.component, entry.slot);
      if (componentValues.has(key)) {
        throw new Error(`NLE authoring Host has multiple Component value declarations for ${key}.`);
      }
      componentValues.set(key, entry);
    }
  }
  return {
    componentTimeWindow(context) {
      return components.get(packageSymbolKey(context.item.component))?.timeWindow?.(context);
    },
    componentSourceTime(context) {
      const declare = components.get(packageSymbolKey(context.item.component))?.sourceTime;
      if (declare === undefined) return undefined;
      const bounds = declare(context);
      const label = `NLE Item ${context.item.id} source time`;
      if (bounds?.kind !== "constant" && bounds?.kind !== "timed") throw new Error(`${label} is invalid.`);
      if (bounds.kind === "timed" && bounds.duration !== undefined) {
        assertExactTemporalValue(bounds.duration, `${label} duration`);
        if (compareExactTemporalValues(bounds.duration, exactTemporalZero()) <= 0) {
          throw new Error(`${label} duration must be positive.`);
        }
      }
      return bounds;
    },
    componentMediaInputs(context) {
      const { item } = context;
      const declare = components.get(packageSymbolKey(item.component))?.mediaInputs;
      if (declare === undefined) return [];
      const inputs = declare(context);
      if (!Array.isArray(inputs)) throw new Error(`NLE Component ${item.id} Media inputs must be an array.`);
      const slots = new Set<string>();
      for (const input of inputs as readonly NleComponentMediaInput[]) {
        if (input === null || typeof input !== "object" || Array.isArray(input)
          || !Object.keys(input).every(key => ["slot", "label", "required", "picture", "audio"].includes(key))
          || typeof input.slot !== "string" || !/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(input.slot)
          || typeof input.label !== "string" || input.label.trim().length === 0 || typeof input.required !== "boolean"
          || (input.picture !== undefined && !["any", "constant", "signal"].includes(input.picture))
          || (input.audio !== undefined && input.audio !== true) || (input.picture === undefined && input.audio !== true)) {
          throw new Error(`NLE Component ${item.id} has an invalid Media input declaration.`);
        }
        if (slots.has(input.slot)) throw new Error(`NLE Component ${item.id} repeats Media input ${input.slot}.`);
        slots.add(input.slot);
      }
      return structuredClone(inputs);
    },
    operatorTimeWindow(context) {
      return operators.get(packageSymbolKey(context.process.operator))?.timeWindow?.(context);
    },
    hasComponentParameterAuthoring(component) {
      return components.get(packageSymbolKey(component))?.editParameters !== undefined;
    },
    hasComponentValueAuthoring(component, slot) {
      return componentValues.has(componentValueKey(component, slot));
    },
    hasOperatorParameterAuthoring(operator) {
      return operators.get(packageSymbolKey(operator))?.editParameters !== undefined;
    },
    hasTransitionParameterAuthoring(operator) {
      return transitions.has(packageSymbolKey(operator));
    },
    planTransitionParameterEdit(context, operation) {
      const { transition } = context;
      const key = packageSymbolKey(transition.operator);
      const contribution = transitions.get(key);
      if (contribution === undefined) throw new Error(`NLE Transition parameter authoring ${key} is not installed.`);
      assertImplementationBinding({ implementation: transition.operator, parameters: { operation } },
        `NLE Transition ${transition.id} parameter operation`);
      const parameters = contribution.editParameters(structuredClone(operation), context);
      assertImplementationBinding({ implementation: transition.operator, parameters }, `NLE Transition ${transition.id} edited parameters`);
      return { commands: [{ kind: "transition.replace", transition: { ...transition, parameters: structuredClone(parameters) } }] };
    },
    planComponentParameterEdit(context, operation) {
      const key = packageSymbolKey(context.item.component);
      const edit = components.get(key)?.editParameters;
      if (edit === undefined) throw new Error(`NLE Component parameter authoring ${key} is not installed.`);
      assertImplementationBinding({ implementation: context.item.component, parameters: { operation } },
        `NLE Component ${key} parameter operation`);
      const parameters = edit(structuredClone(operation), context);
      assertImplementationBinding({ implementation: context.item.component, parameters },
        `NLE Component ${key} edited parameters`);
      return { commands: [{
        kind: "item.replace",
        item: { ...structuredClone(context.item), parameters: structuredClone(parameters) },
      }] };
    },
    planProcessParameterEdit(context, address, operation) {
      const key = packageSymbolKey(context.process.operator);
      const edit = operators.get(key)?.editParameters;
      if (edit === undefined) throw new Error(`NLE Operator parameter authoring ${key} is not installed.`);
      assertImplementationBinding({ implementation: context.process.operator, parameters: { operation } },
        `NLE Operator ${key} parameter operation`);
      const parameters = edit(structuredClone(operation), context);
      assertImplementationBinding({ implementation: context.process.operator, parameters },
        `NLE Operator ${key} edited parameters`);
      if (context.process.parameters.kind === "shared") {
        const value = findNleOperatorSharedValue(context.project, context.process.parameters.ref);
        return { commands: [{
          kind: "shared-value.replace",
          value: { ...structuredClone(value), value: structuredClone(parameters) },
        }] };
      }
      const binding = { kind: "inline" as const, value: structuredClone(parameters) };
      if (address.kind === "adjust") {
        return { commands: [{
          kind: "item.replace",
          item: { ...structuredClone(context.item), parameters: binding } as NleAdjustItem,
        }] };
      }
      return { commands: [{
        kind: "process.replace",
        item: address.item,
        medium: address.medium,
        process: { ...structuredClone(context.process), parameters: binding },
      }] };
    },
    planComponentValueEdit(context, operation) {
      const current = createNleComponentValueAuthoringContext(context.project, context.item.id, context.slot);
      const component = current.item.component;
      const key = componentValueKey(component, current.slot);
      const edit = componentValues.get(key)?.editValue;
      if (edit === undefined) throw new Error(`NLE Component value authoring ${key} is not installed.`);
      assertImplementationBinding({ implementation: component, parameters: { operation } },
        `NLE Component ${current.item.id} value ${current.slot} operation`);
      const value = edit(structuredClone(operation), current);
      assertImplementationBinding({ implementation: component, parameters: value },
        `NLE Component ${current.item.id} value ${current.slot} edited value`);
      return current.sharedValue === undefined
        ? { commands: [{
            kind: "component-value-binding.set",
            item: current.item.id,
            binding: { slot: current.slot, kind: "inline", value: structuredClone(value) },
          }] }
        : { commands: [{
            kind: "shared-value.replace",
            value: { ...structuredClone(current.sharedValue), value: structuredClone(value) },
          }] };
    },
  };
}
