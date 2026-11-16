import { assertImplementationBinding, type PackageSymbol } from "@hypit/audiovisual";
import { indexNleProject } from "../indexing.js";
import {
  findNleComponentSharedValue,
  findNleOperatorSharedValue,
} from "../project.js";
import type {
  NleAdjustItem,
  NleComponentItem,
  NleComponentSharedValue,
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

export type NleComponentSharedValueAuthoringContext = {
  readonly project: NleProject;
  readonly value: NleComponentSharedValue;
  /** Current users derived from this exact Project snapshot. */
  readonly users: readonly {
    readonly composition: NleComposition;
    readonly track: NleTrack;
    readonly item: NleComponentItem;
  }[];
};

export type NleComponentTemporalAuthoring = {
  readonly component: PackageSymbol;
  /** Whether ordinary trim and split operations preserve this occurrence's Source clock. */
  readonly timeWindow?: (context: NleComponentTemporalAuthoringContext) => boolean;
  /** Package-owned parameter operation. The returned closed parameters replace this occurrence's parameters. */
  readonly editParameters?: (
    operation: unknown,
    context: NleComponentTemporalAuthoringContext,
  ) => Readonly<Record<string, unknown>>;
};

export type NleOperatorTemporalAuthoring = {
  readonly operator: PackageSymbol;
  /** Whether slicing the containing Item preserves this exact Control/process meaning. */
  readonly timeWindow?: (context: NleProcessAuthoringContext) => boolean;
  readonly editParameters?: (
    operation: unknown,
    context: NleProcessAuthoringContext,
  ) => Readonly<Record<string, unknown>>;
};

/** Package-owned editing semantics for one exact reusable Component slot. */
export type NleComponentSharedValueAuthoring = {
  readonly component: PackageSymbol;
  readonly slot: string;
  readonly editValue: (
    operation: unknown,
    context: NleComponentSharedValueAuthoringContext,
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
  readonly componentSharedValues: readonly NleComponentSharedValueAuthoring[];
  readonly operators: readonly NleOperatorTemporalAuthoring[];
};

export type NleAuthoringHost = {
  readonly componentTimeWindow: (context: NleComponentTemporalAuthoringContext) => boolean | undefined;
  readonly operatorTimeWindow: (context: NleProcessAuthoringContext) => boolean | undefined;
  readonly hasComponentParameterAuthoring: (component: PackageSymbol) => boolean;
  readonly hasComponentSharedValueAuthoring: (component: PackageSymbol, slot: string) => boolean;
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
  readonly planComponentSharedValueEdit: (
    context: NleComponentSharedValueAuthoringContext,
    operation: unknown,
  ) => NleTransaction;
};

function componentSharedValueKey(component: PackageSymbol, slot: string): string {
  return `${packageSymbolKey(component)}:${slot}`;
}

export function createNleComponentSharedValueAuthoringContext(
  project: NleProject,
  valueId: string,
): NleComponentSharedValueAuthoringContext {
  const value = findNleComponentSharedValue(project, valueId);
  const users = indexNleProject(project).sharedValueUsers(valueId).map(({ composition, track, item }) => {
    if (item.kind !== "present" || item.source !== "component") {
      throw new Error(`NLE Component Shared Value ${valueId} has non-Component user ${item.id}.`);
    }
    return { composition, track, item };
  });
  return { project, value, users };
}

function assertContribution(value: NleAuthoringContribution): void {
  if (value === null || typeof value !== "object") {
    throw new Error("NLE authoring contribution must be an object.");
  }
  if (!Array.isArray(value.components) || !Array.isArray(value.componentSharedValues)
    || !Array.isArray(value.operators)) {
    throw new Error("NLE authoring contribution declarations must be arrays.");
  }
  assertContributionOwner(value.package, [
    ...value.components.map((entry) => entry.component),
    ...value.componentSharedValues.map((entry) => entry.component),
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
  for (const entry of value.componentSharedValues) {
    if (!/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(entry.slot)) {
      throw new Error("NLE Component Shared Value authoring slot is invalid.");
    }
    const key = `component-shared-value:${componentSharedValueKey(entry.component, entry.slot)}`;
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
  readonly componentSharedValues?: readonly NleComponentSharedValueAuthoring[];
  readonly operators?: readonly NleOperatorTemporalAuthoring[];
}): NleAuthoringContribution {
  const contribution: NleAuthoringContribution = {
    kind: nleAuthoringContributionKind,
    package: value.package,
    components: [...(value.components ?? [])],
    componentSharedValues: [...(value.componentSharedValues ?? [])],
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
  const componentSharedValues = new Map<string, NleComponentSharedValueAuthoring>();
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
    for (const entry of contribution.componentSharedValues) {
      const key = componentSharedValueKey(entry.component, entry.slot);
      if (componentSharedValues.has(key)) {
        throw new Error(`NLE authoring Host has multiple Component Shared Value declarations for ${key}.`);
      }
      componentSharedValues.set(key, entry);
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
    hasComponentSharedValueAuthoring(component, slot) {
      return componentSharedValues.has(componentSharedValueKey(component, slot));
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
    planComponentSharedValueEdit(context, operation) {
      const current = createNleComponentSharedValueAuthoringContext(context.project, context.value.id);
      const { component, slot } = current.value.declaration;
      const key = componentSharedValueKey(component, slot);
      const edit = componentSharedValues.get(key)?.editValue;
      if (edit === undefined) throw new Error(`NLE Component Shared Value authoring ${key} is not installed.`);
      assertImplementationBinding({ implementation: component, parameters: { operation } },
        `NLE Component Shared Value ${current.value.id} operation`);
      const value = edit(structuredClone(operation), current);
      assertImplementationBinding({ implementation: component, parameters: value },
        `NLE Component Shared Value ${current.value.id} edited value`);
      return { commands: [{
        kind: "shared-value.replace",
        value: { ...structuredClone(current.value), value: structuredClone(value) },
      }] };
    },
  };
}
