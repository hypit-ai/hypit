import { assertImplementationBinding, type PackageSymbol } from "@hypit/audiovisual";
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
  NleProcess,
  NlePresentItem,
  NleProject,
  NleTrack,
} from "../types.js";
import type { NleTransaction } from "../transaction.js";
import { assertContributionOwner, packageSymbolKey } from "./symbol.js";

export const nleAuthoringContributionKind = "hypit.nle-authoring";

export type NleComponentTemporalAuthoringContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
  readonly item: NleComponentItem;
};

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

export type NleComponentTemporalAuthoring = {
  readonly component: PackageSymbol;
  /** Whether ordinary trim and split preserve this occurrence by slicing only its existing Source relation. */
  readonly timeWindow?: (context: NleComponentTemporalAuthoringContext) => boolean;
  /** Package-owned parameter operation. The returned closed parameters replace this occurrence's parameters. */
  readonly editParameters?: (
    operation: unknown,
    context: NleComponentTemporalAuthoringContext,
  ) => Readonly<Record<string, unknown>>;
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
  readonly components: readonly NleComponentTemporalAuthoring[];
  readonly componentValues: readonly NleComponentValueAuthoring[];
  readonly operators: readonly NleOperatorTemporalAuthoring[];
};

export type NleAuthoringHost = {
  readonly componentTimeWindow: (context: NleComponentTemporalAuthoringContext) => boolean | undefined;
  readonly operatorTimeWindow: (context: NleProcessAuthoringContext) => boolean | undefined;
  readonly hasComponentParameterAuthoring: (component: PackageSymbol) => boolean;
  readonly hasComponentValueAuthoring: (component: PackageSymbol, slot: string) => boolean;
  readonly hasOperatorParameterAuthoring: (operator: PackageSymbol) => boolean;
  readonly planComponentParameterEdit: (
    context: NleComponentTemporalAuthoringContext,
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

function componentValueKey(component: PackageSymbol, slot: string): string {
  return `${packageSymbolKey(component)}:${slot}`;
}

export function createNleComponentValueAuthoringContext(
  project: NleProject,
  itemId: string,
  slot: string,
): NleComponentValueAuthoringContext {
  const index = indexNleProject(project);
  const located = index.item(itemId);
  if (located === undefined || located.item.kind !== "present" || located.item.source !== "component") {
    throw new Error(`NLE Item ${itemId} is not a Component Present.`);
  }
  const { composition, track, item } = located;
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
    || !Array.isArray(value.operators)) {
    throw new Error("NLE authoring contribution declarations must be arrays.");
  }
  assertContributionOwner(value.package, [
    ...value.components.map((entry) => entry.component),
    ...value.componentValues.map((entry) => entry.component),
    ...value.operators.map((entry) => entry.operator),
  ], "NLE authoring contribution");
  const keys = new Set<string>();
  for (const entry of value.components) {
    const key = `component:${packageSymbolKey(entry.component)}`;
    if (keys.has(key)) throw new Error(`NLE authoring contribution repeats ${key}.`);
    keys.add(key);
    if (entry.timeWindow !== undefined && typeof entry.timeWindow !== "function") {
      throw new Error(`NLE authoring contribution ${key} timeWindow is not callable.`);
    }
    if (entry.editParameters !== undefined && typeof entry.editParameters !== "function") {
      throw new Error(`NLE authoring contribution ${key} editParameters is not callable.`);
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
  readonly components?: readonly NleComponentTemporalAuthoring[];
  readonly componentValues?: readonly NleComponentValueAuthoring[];
  readonly operators?: readonly NleOperatorTemporalAuthoring[];
}): NleAuthoringContribution {
  const contribution: NleAuthoringContribution = {
    kind: nleAuthoringContributionKind,
    package: value.package,
    components: [...(value.components ?? [])],
    componentValues: [...(value.componentValues ?? [])],
    operators: [...(value.operators ?? [])],
  };
  assertContribution(contribution);
  return contribution;
}

/** Assemble only caller-selected installed contributions; missing and duplicate symbols stay observable. */
export function createNleAuthoringHost(
  contributions: readonly NleAuthoringContribution[],
): NleAuthoringHost {
  const components = new Map<string, NleComponentTemporalAuthoring>();
  const componentValues = new Map<string, NleComponentValueAuthoring>();
  const operators = new Map<string, NleOperatorTemporalAuthoring>();
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
