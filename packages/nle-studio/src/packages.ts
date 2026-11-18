import { assertImplementationBinding, assertPackageSymbol, type NlePictureLayout, type PackageSymbol } from "@hypit/nle";
import {
  createNleAuthoringHost,
  createNleTimelinePresentationHost,
  nleAuthoringContributionKind,
  nleInspectorPresentationContributionKind,
  nleTimelinePresentationContributionKind,
  type NleAuthoringContribution,
  type NleAuthoringHost,
  type NleInspectorPresentationContribution,
  type NleTimelinePresentationContribution,
  type NleTimelinePresentationHost,
} from "@hypit/nle/view";
import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import type { ProjectPackageCatalogResolution, ProjectPackageEnvironment } from "@hypit/project";

export const nleStudioComponentOfferingKind = "hypit.nle-component";
export const nleStudioAdjustOfferingKind = "hypit.nle-adjust";
export const nleStudioProcessOfferingKind = "hypit.nle-process";
export const nleStudioTransitionOfferingKind = "hypit.nle-transition";

export type NleStudioComponentCategory = "text" | "subtitle" | "graphic";

export type NleStudioComponentOfferingValue = {
  readonly category: NleStudioComponentCategory;
  readonly component: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly values?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly duration: ExactTemporalValue;
  readonly layout?: NlePictureLayout;
};

export type NleStudioComponentOffering = {
  readonly package: string;
  readonly id: string;
  readonly title: string;
  readonly value: NleStudioComponentOfferingValue;
};

export type NleStudioProcessOfferingValue = {
  readonly medium: "picture" | "audio";
  readonly operator: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
};

export type NleStudioAdjustOfferingValue = NleStudioProcessOfferingValue & { readonly duration: ExactTemporalValue };

export type NleStudioProcessOffering = {
  readonly package: string;
  readonly id: string;
  readonly title: string;
  readonly value: NleStudioProcessOfferingValue;
};

export type NleStudioAdjustOffering = {
  readonly package: string;
  readonly id: string;
  readonly title: string;
  readonly value: NleStudioAdjustOfferingValue;
};

export type NleStudioTransitionOfferingValue = {
  readonly operator: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly duration: ExactTemporalValue;
};

export type NleStudioTransitionOffering = {
  readonly package: string;
  readonly id: string;
  readonly title: string;
  readonly value: NleStudioTransitionOfferingValue;
};

export type NleStudioPackageBridge = {
  readonly authoring: NleAuthoringHost;
  readonly timelinePresentation: NleTimelinePresentationHost;
  readonly inspectorPresentations: readonly NleInspectorPresentationContribution[];
  readonly components: readonly NleStudioComponentOffering[];
  readonly adjusts: readonly NleStudioAdjustOffering[];
  readonly processes: readonly NleStudioProcessOffering[];
  readonly transitions: readonly NleStudioTransitionOffering[];
  readonly component: (packageName: string, offering: string) => NleStudioComponentOffering | undefined;
  readonly adjust: (packageName: string, offering: string) => NleStudioAdjustOffering | undefined;
  readonly process: (packageName: string, offering: string) => NleStudioProcessOffering | undefined;
  readonly transition: (packageName: string, offering: string) => NleStudioTransitionOffering | undefined;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertClosedRecord(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function assertLayout(value: unknown, label: string): asserts value is NlePictureLayout {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const layout = value as Readonly<Record<string, unknown>>;
  const fields = Object.keys(layout);
  assert(fields.every((field) => ["x", "y", "width", "height", "fit", "contentX", "contentY"].includes(field)),
    `${label} fields are invalid.`);
  for (const field of ["x", "y", "width", "height"] as const) {
    assert(typeof layout[field] === "number" && Number.isFinite(layout[field]), `${label}.${field} is invalid.`);
  }
  assert((layout.width as number) > 0 && (layout.height as number) > 0, `${label} extent must be positive.`);
  assert(layout.fit === "fill" || layout.fit === "contain" || layout.fit === "cover", `${label}.fit is invalid.`);
  for (const field of ["contentX", "contentY"] as const) {
    assert(layout[field] === undefined || typeof layout[field] === "number" && Number.isFinite(layout[field]),
      `${label}.${field} is invalid.`);
  }
}

function contribution<Value extends { readonly kind: string; readonly package: string }>(
  packages: ProjectPackageEnvironment,
  kind: string,
): readonly Value[] {
  return packages.contributions(kind).map((entry) => {
    assert(entry.value !== null && typeof entry.value === "object" && !Array.isArray(entry.value),
      `Project package ${entry.package} contribution ${kind} must be an object.`);
    const value = entry.value as Value;
    assert(value.kind === kind, `Project package ${entry.package} contribution ${kind} declares a different kind.`);
    assert(value.package === entry.package,
      `Project package ${entry.package} contribution ${kind} declares a different package owner.`);
    return value;
  });
}

function componentOffering(entry: ProjectPackageCatalogResolution): NleStudioComponentOffering {
  const label = `NLE Studio Component offering ${entry.package}#${entry.id}`;
  assert(entry.value !== null && typeof entry.value === "object" && !Array.isArray(entry.value),
    `${label} value must be an object.`);
  const value = entry.value as Readonly<Record<string, unknown>>;
  assert(Object.keys(value).every((field) => ["category", "component", "parameters", "duration", "layout", "values"].includes(field))
    && ["category", "component", "parameters", "duration"].every((field) => Object.hasOwn(value, field)),
  `${label} fields are invalid.`);
  assert(value.category === "text" || value.category === "subtitle" || value.category === "graphic",
    `${label} category is invalid.`);
  assertPackageSymbol(value.component as PackageSymbol, `${label} Component`);
  const symbol = value.component as PackageSymbol;
  assert(symbol.package === entry.package, `${label} Component must be owned by its package.`);
  assertClosedRecord(value.parameters, `${label} parameters`);
  assertImplementationBinding({ implementation: symbol, parameters: value.parameters }, label);
  assertExactTemporalValue(value.duration as ExactTemporalValue, `${label} duration`);
  assert(compareExactTemporalValues(value.duration as ExactTemporalValue, exactTemporalZero()) > 0,
    `${label} duration must be positive.`);
  if (value.layout !== undefined) assertLayout(value.layout, `${label} layout`);
  let values: NleStudioComponentOfferingValue["values"];
  if (value.values !== undefined) {
    assertClosedRecord(value.values, `${label} values`);
    values = Object.fromEntries(Object.entries(value.values).map(([slot, seed]) => {
      assert(slot.trim().length > 0, `${label} value slot must be named.`);
      assertClosedRecord(seed, `${label} value ${slot}`);
      assertImplementationBinding({ implementation: symbol, parameters: seed }, `${label} value ${slot}`);
      return [slot, structuredClone(seed)];
    }));
  }
  return {
    package: entry.package,
    id: entry.id,
    title: entry.title,
    value: {
      category: value.category,
      component: structuredClone(symbol),
      parameters: structuredClone(value.parameters),
      duration: structuredClone(value.duration as ExactTemporalValue),
      ...(value.layout === undefined ? {} : { layout: structuredClone(value.layout as NlePictureLayout) }),
      ...(values === undefined ? {} : { values }),
    },
  };
}

function adjustOffering(entry: ProjectPackageCatalogResolution): NleStudioAdjustOffering {
  const label = `NLE Studio Adjust offering ${entry.package}#${entry.id}`;
  assert(entry.value !== null && typeof entry.value === "object" && !Array.isArray(entry.value),
    `${label} value must be an object.`);
  const value = entry.value as Readonly<Record<string, unknown>>;
  assert(Object.keys(value).length === 4
    && ["medium", "operator", "parameters", "duration"].every((field) => Object.hasOwn(value, field)),
  `${label} fields are invalid.`);
  assert(value.medium === "picture" || value.medium === "audio", `${label} medium is invalid.`);
  assertPackageSymbol(value.operator as PackageSymbol, `${label} Operator`);
  const operator = value.operator as PackageSymbol;
  assert(operator.package === entry.package, `${label} Operator must be owned by its package.`);
  assertClosedRecord(value.parameters, `${label} parameters`);
  assertImplementationBinding({ implementation: operator, parameters: value.parameters }, label);
  assertExactTemporalValue(value.duration as ExactTemporalValue, `${label} duration`);
  assert(compareExactTemporalValues(value.duration as ExactTemporalValue, exactTemporalZero()) > 0,
    `${label} duration must be positive.`);
  return {
    package: entry.package,
    id: entry.id,
    title: entry.title,
    value: {
      medium: value.medium,
      operator: structuredClone(operator),
      parameters: structuredClone(value.parameters),
      duration: structuredClone(value.duration as ExactTemporalValue),
    },
  };
}

function processOffering(entry: ProjectPackageCatalogResolution): NleStudioProcessOffering {
  const label = `NLE Studio Process offering ${entry.package}#${entry.id}`;
  assertClosedRecord(entry.value, label);
  const value = entry.value;
  assert(Object.keys(value).length === 3 && ["medium", "operator", "parameters"].every(key => Object.hasOwn(value, key)),
    `${label} fields are invalid.`);
  assert(value.medium === "picture" || value.medium === "audio", `${label} medium is invalid.`);
  const operator = value.operator as PackageSymbol;
  assertPackageSymbol(operator, `${label} Operator`);
  assert(operator.package === entry.package, `${label} Operator must be owned by its package.`);
  assertClosedRecord(value.parameters, `${label} parameters`);
  assertImplementationBinding({ implementation: operator, parameters: value.parameters }, label);
  return {
    package: entry.package, id: entry.id, title: entry.title,
    value: { medium: value.medium, operator: structuredClone(operator), parameters: structuredClone(value.parameters) },
  };
}

function transitionOffering(entry: ProjectPackageCatalogResolution): NleStudioTransitionOffering {
  const label = `NLE Studio Transition offering ${entry.package}#${entry.id}`;
  assert(entry.value !== null && typeof entry.value === "object" && !Array.isArray(entry.value),
    `${label} value must be an object.`);
  const value = entry.value as Readonly<Record<string, unknown>>;
  assert(Object.keys(value).length === 3
    && ["operator", "parameters", "duration"].every((field) => Object.hasOwn(value, field)),
    `${label} fields are invalid.`);
  assertPackageSymbol(value.operator as PackageSymbol, `${label} Operator`);
  const operator = value.operator as PackageSymbol;
  assert(operator.package === entry.package, `${label} Operator must be owned by its package.`);
  assertClosedRecord(value.parameters, `${label} parameters`);
  assertImplementationBinding({ implementation: operator, parameters: value.parameters }, label);
  assertExactTemporalValue(value.duration as ExactTemporalValue, `${label} duration`);
  assert(compareExactTemporalValues(value.duration as ExactTemporalValue, exactTemporalZero()) > 0,
    `${label} duration must be positive.`);
  return {
    package: entry.package,
    id: entry.id,
    title: entry.title,
    value: {
      operator: structuredClone(operator),
      parameters: structuredClone(value.parameters),
      duration: structuredClone(value.duration as ExactTemporalValue),
    },
  };
}

/** Assemble the NLE-facing capabilities of only the packages selected by this Project Boundary. */
export function createNleStudioPackageBridge(packages: ProjectPackageEnvironment): NleStudioPackageBridge {
  const authoringContributions = contribution<NleAuthoringContribution>(packages, nleAuthoringContributionKind);
  const timelineContributions = contribution<NleTimelinePresentationContribution>(
    packages, nleTimelinePresentationContributionKind,
  );
  const inspectorPresentations = contribution<NleInspectorPresentationContribution>(
    packages, nleInspectorPresentationContributionKind,
  );
  const components = packages.catalog(nleStudioComponentOfferingKind).map(componentOffering);
  const adjusts = packages.catalog(nleStudioAdjustOfferingKind).map(adjustOffering);
  const processes = packages.catalog(nleStudioProcessOfferingKind).map(processOffering);
  const transitions = packages.catalog(nleStudioTransitionOfferingKind).map(transitionOffering);
  const keys = new Set<string>();
  for (const entry of [...components, ...adjusts, ...processes, ...transitions]) {
    const key = `${entry.package}#${entry.id}`;
    assert(!keys.has(key), `NLE Studio catalog repeats ${key}.`);
    keys.add(key);
  }
  return {
    authoring: createNleAuthoringHost(authoringContributions),
    timelinePresentation: createNleTimelinePresentationHost(timelineContributions),
    inspectorPresentations,
    components,
    adjusts,
    processes,
    transitions,
    component(packageName, offering) {
      return components.find((entry) => entry.package === packageName && entry.id === offering);
    },
    adjust(packageName, offering) {
      return adjusts.find((entry) => entry.package === packageName && entry.id === offering);
    },
    process(packageName, offering) {
      return processes.find((entry) => entry.package === packageName && entry.id === offering);
    },
    transition(packageName, offering) {
      return transitions.find((entry) => entry.package === packageName && entry.id === offering);
    },
  };
}
