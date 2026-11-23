import { findNleComposition } from "../project.js";
import type { NleEditingContext } from "./types.js";
import type { PackageSymbol } from "../implementation.js";
import { exactTemporalRational, subtractExactTemporalValues } from "@hypit/temporal/algebra";
import { nleProcessControlDuration } from "../process-time.js";
import { projectNleProcessEdge } from "./projection.js";
import { planNleComponentValueEdit } from "../component-value-authoring.js";
import { planNleSpatialEdit } from "../spatial-authoring.js";
import { indexNleProject } from "../indexing.js";
import {
  findNleOperatorSharedValue,
  findNleComponentSharedValue,
  findNlePictureLayoutSharedValue,
  nleItemEnd,
  resolveNleOperatorParameters,
  resolveNlePictureLayout,
} from "../project.js";
import type { NleItem, NleProject, NleTrack } from "../types.js";
import type { NleTransaction } from "../transaction.js";
import type {
  NleAuthoringHost,
  NleComponentAuthoringContext,
  NleComponentValueAuthoringContext,
  NleProcessAddress,
  NleProcessAuthoringContext,
  NleTransitionAuthoringContext,
} from "./authoring.js";
import { createNleComponentValueAuthoringContext } from "./authoring.js";
import { assertContributionOwner, packageSymbolKey } from "./symbol.js";
import type {
  NleInspectorFieldDraft,
  NleInspectorScene,
  NleInspectorSection,
  NleInspectorSectionDraft,
  NleTimelineItemObservation,
  NleTransitionInspectorScene,
} from "./projection-types.js";

export const nleInspectorPresentationContributionKind = "hypit.nle-inspector-presentation";

export type NleInspectorComponentPresentation = {
  readonly component: PackageSymbol;
  readonly project: (context: NleComponentAuthoringContext) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorOperatorPresentation = {
  readonly operator: PackageSymbol;
  readonly project: (context: NleProcessAuthoringContext) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorTransitionPresentation = {
  readonly operator: PackageSymbol;
  readonly project: (context: NleTransitionAuthoringContext) => readonly Omit<NleInspectorSectionDraft, "collections">[];
};

export type NleInspectorComponentValuePresentation = {
  readonly component: PackageSymbol;
  readonly slot: string;
  readonly project: (context: NleComponentValueAuthoringContext) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorPresentationContribution = {
  readonly kind: typeof nleInspectorPresentationContributionKind;
  readonly package: string;
  readonly components: readonly NleInspectorComponentPresentation[];
  readonly componentValues: readonly NleInspectorComponentValuePresentation[];
  readonly operators: readonly NleInspectorOperatorPresentation[];
  readonly transitions?: readonly NleInspectorTransitionPresentation[];
};

export type NleInspectorPresentationHost = {
  readonly scene: (
    project: NleProject,
    editing: NleEditingContext,
    item: string,
    observations?: readonly NleTimelineItemObservation[],
  ) => NleInspectorScene;
  readonly planEdit: (
    project: NleProject,
    editing: NleEditingContext,
    item: string,
    section: string,
    field: string,
    value: string | number | boolean,
  ) => NleTransaction;
  readonly planRowAction: (
    project: NleProject,
    editing: NleEditingContext,
    item: string,
    address: { readonly section: string; readonly collection: string; readonly row: string; readonly action: string },
  ) => NleTransaction;
  readonly transitionScene: (project: NleProject, editing: NleEditingContext, transition: string) => NleTransitionInspectorScene;
  readonly planTransitionEdit: (
    project: NleProject, editing: NleEditingContext, transition: string, section: string, field: string, value: string | number | boolean,
  ) => NleTransaction;
};

const domains = new Set(["where", "when", "how"]);
const controls = new Set(["readout", "text", "number", "boolean", "select", "color"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertField(value: NleInspectorFieldDraft, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(typeof value.id === "string" && value.id.length > 0, `${label}.id is invalid.`);
  assert(typeof value.label === "string" && value.label.length > 0, `${label}.label is invalid.`);
  assert(controls.has(value.control), `${label}.control is invalid.`);
  assert(typeof value.value === "string" || typeof value.value === "boolean"
    || typeof value.value === "number" && Number.isFinite(value.value), `${label}.value is invalid.`);
  if (value.control === "number") assert(typeof value.value === "number", `${label}.value must be a number.`);
  if (value.control === "boolean") assert(typeof value.value === "boolean", `${label}.value must be boolean.`);
  if (value.control === "select") {
    assert(typeof value.value === "string" && Array.isArray(value.options) && value.options.length > 0,
      `${label} select options are required.`);
    assert(value.options.every((option) => typeof option.value === "string" && typeof option.label === "string"),
      `${label} select options are invalid.`);
    assert(value.options.some((option) => option.value === value.value), `${label} select value is not an option.`);
  } else assert(value.options === undefined, `${label}.options belong only to select fields.`);
  if (value.control !== "number") {
    assert(value.minimum === undefined && value.maximum === undefined && value.step === undefined,
      `${label} numeric bounds belong only to number fields.`);
  } else {
    assert(value.minimum === undefined || Number.isFinite(value.minimum), `${label}.minimum is invalid.`);
    assert(value.maximum === undefined || Number.isFinite(value.maximum), `${label}.maximum is invalid.`);
    assert(value.step === undefined || Number.isFinite(value.step) && value.step > 0, `${label}.step is invalid.`);
    assert(value.minimum === undefined || value.maximum === undefined || value.minimum <= value.maximum,
      `${label} numeric bounds are reversed.`);
  }
  assert(value.operation === undefined || typeof value.operation === "function", `${label}.operation is not callable.`);
  assert(value.control !== "readout" || value.operation === undefined, `${label} readout cannot define an operation.`);
}

function assertDraft(value: NleInspectorSectionDraft, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(typeof value.id === "string" && value.id.length > 0, `${label}.id is invalid.`);
  assert(typeof value.label === "string" && value.label.length > 0, `${label}.label is invalid.`);
  assert(domains.has(value.domain), `${label}.domain is invalid.`);
  assert(Array.isArray(value.fields), `${label}.fields must be an array.`);
  assert(value.collections === undefined || Array.isArray(value.collections), `${label}.collections must be an array.`);
  assert(value.fields.length > 0 || (value.collections?.length ?? 0) > 0,
    `${label} must contain fields or collections.`);
  const fields = new Set<string>();
  const validateField = (field: NleInspectorFieldDraft, fieldLabel: string): void => {
    assertField(field, fieldLabel);
    assert(!fields.has(field.id), `${label} repeats field ${field.id}.`);
    fields.add(field.id);
  };
  for (const [index, field] of value.fields.entries()) {
    validateField(field, `${label}.fields[${index}]`);
  }
  const collections = new Set<string>();
  for (const [collectionIndex, collection] of (value.collections ?? []).entries()) {
    const collectionLabel = `${label}.collections[${collectionIndex}]`;
    assert(collection !== null && typeof collection === "object" && !Array.isArray(collection),
      `${collectionLabel} must be an object.`);
    assert(typeof collection.id === "string" && collection.id.length > 0, `${collectionLabel}.id is invalid.`);
    assert(typeof collection.label === "string" && collection.label.length > 0,
      `${collectionLabel}.label is invalid.`);
    assert(!collections.has(collection.id), `${label} repeats collection ${collection.id}.`);
    collections.add(collection.id);
    assert(Array.isArray(collection.rows), `${collectionLabel}.rows must be an array.`);
    const rows = new Set<string>();
    for (const [rowIndex, row] of collection.rows.entries()) {
      const rowLabel = `${collectionLabel}.rows[${rowIndex}]`;
      assert(row !== null && typeof row === "object" && !Array.isArray(row), `${rowLabel} must be an object.`);
      assert(typeof row.id === "string" && row.id.length > 0, `${rowLabel}.id is invalid.`);
      assert(row.label === undefined || typeof row.label === "string" && row.label.length > 0,
        `${rowLabel}.label is invalid.`);
      assert(!rows.has(row.id), `${collectionLabel} repeats row ${row.id}.`);
      rows.add(row.id);
      assert(Array.isArray(row.fields) && (row.actions === undefined || Array.isArray(row.actions)),
        `${rowLabel} fields and actions must be arrays.`);
      assert(row.fields.length > 0 || (row.actions?.length ?? 0) > 0, `${rowLabel} must contain fields or actions.`);
      for (const [fieldIndex, field] of row.fields.entries()) {
        validateField(field, `${rowLabel}.fields[${fieldIndex}]`);
      }
      const actions = new Set<string>();
      for (const action of row.actions ?? []) {
        assert(action !== null && typeof action === "object" && typeof action.id === "string" && action.id.length > 0
          && typeof action.label === "string" && action.label.length > 0 && typeof action.operation === "function",
        `${rowLabel} has an invalid action.`);
        assert(!actions.has(action.id), `${rowLabel} repeats action ${action.id}.`);
        actions.add(action.id);
      }
    }
  }
}

function assertContribution(value: NleInspectorPresentationContribution): void {
  assert(value !== null && typeof value === "object", "NLE Inspector contribution must be an object.");
  assert(Array.isArray(value.components) && Array.isArray(value.componentValues)
    && Array.isArray(value.operators) && (value.transitions === undefined || Array.isArray(value.transitions)),
    "NLE Inspector contribution declarations must be arrays.");
  assertContributionOwner(value.package, [
    ...value.components.map((entry) => entry.component),
    ...value.componentValues.map((entry) => entry.component),
    ...value.operators.map((entry) => entry.operator),
    ...(value.transitions ?? []).map(entry => entry.operator),
  ], "NLE Inspector contribution");
  const keys = new Set<string>();
  for (const entry of value.components) {
    const key = `component:${packageSymbolKey(entry.component)}`;
    assert(!keys.has(key), `NLE Inspector contribution repeats ${key}.`);
    keys.add(key);
    assert(typeof entry.project === "function", `NLE Inspector ${key} projector is not callable.`);
  }
  for (const entry of value.operators) {
    const key = `operator:${packageSymbolKey(entry.operator)}`;
    assert(!keys.has(key), `NLE Inspector contribution repeats ${key}.`);
    keys.add(key);
    assert(typeof entry.project === "function", `NLE Inspector ${key} projector is not callable.`);
  }
  for (const entry of value.transitions ?? []) {
    const key = `transition:${packageSymbolKey(entry.operator)}`;
    assert(!keys.has(key), `NLE Inspector contribution repeats ${key}.`);
    keys.add(key);
    assert(typeof entry.project === "function", `NLE Inspector ${key} projector is not callable.`);
  }
  for (const entry of value.componentValues) {
    assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(entry.slot),
      "NLE Inspector Component value slot is invalid.");
    const key = `component-value:${componentValueKey(entry.component, entry.slot)}`;
    assert(!keys.has(key), `NLE Inspector contribution repeats ${key}.`);
    keys.add(key);
    assert(typeof entry.project === "function", `NLE Inspector ${key} projector is not callable.`);
  }
}

export function createNleInspectorPresentationContribution(value: {
  readonly package: string;
  readonly components?: readonly NleInspectorComponentPresentation[];
  readonly componentValues?: readonly NleInspectorComponentValuePresentation[];
  readonly operators?: readonly NleInspectorOperatorPresentation[];
  readonly transitions?: readonly NleInspectorTransitionPresentation[];
}): NleInspectorPresentationContribution {
  const contribution: NleInspectorPresentationContribution = {
    kind: nleInspectorPresentationContributionKind,
    package: value.package,
    components: [...(value.components ?? [])],
    componentValues: [...(value.componentValues ?? [])],
    operators: [...(value.operators ?? [])],
    ...(value.transitions === undefined ? {} : { transitions: [...value.transitions] }),
  };
  assertContribution(contribution);
  return contribution;
}

function frames(value: NleItem["start"], project: NleProject): number {
  const exact = exactTemporalRational(value);
  return Number(exact.numerator) / Number(exact.denominator)
    * project.editRate.numerator / project.editRate.denominator;
}

function locatedItem(project: NleProject, editing: NleEditingContext, id: string) {
  const composition = findNleComposition(project, editing.activeComposition);
  for (const track of composition.tracks) {
    const item = track.items.find((candidate) => candidate.id === id);
    if (item !== undefined) return { composition, track, item };
  }
  throw new Error(`NLE Inspector Item ${id} is not in active Composition ${composition.id}.`);
}

function itemTitle(project: NleProject, item: NleItem): string {
  if (item.name !== undefined) return item.name;
  if (item.kind === "adjust") return item.operator.symbol;
  if (item.source === "media") {
    return (item.asset.path.split("/").at(-1) ?? item.asset.path).replace(/\.media\.json$/u, "");
  }
  if (item.source === "component") return item.component.symbol;
  return project.compositions.find((composition) => composition.id === item.composition)?.name ?? item.composition;
}

function validateEdit(field: NleInspectorFieldDraft, value: string | number | boolean): void {
  if (field.control === "number") {
    assert(typeof value === "number" && Number.isFinite(value),
      `NLE Inspector field ${field.id} requires a finite number.`);
    assert(field.minimum === undefined || value >= field.minimum,
      `NLE Inspector field ${field.id} is below its minimum.`);
    assert(field.maximum === undefined || value <= field.maximum,
      `NLE Inspector field ${field.id} is above its maximum.`);
  } else if (field.control === "boolean") {
    assert(typeof value === "boolean", `NLE Inspector field ${field.id} requires a boolean.`);
  } else {
    assert(typeof value === "string", `NLE Inspector field ${field.id} requires text.`);
  }
  if (field.control === "select") {
    assert(field.options?.some((option) => option.value === value),
      `NLE Inspector field ${field.id} value is not an option.`);
  }
}

type ProjectedPackageSection = {
  readonly section: NleInspectorSection;
  readonly draft: NleInspectorSectionDraft;
  readonly context: NleComponentAuthoringContext
    | NleComponentValueAuthoringContext
    | NleProcessAuthoringContext;
  readonly componentValue?: true;
  readonly address?: NleProcessAddress;
  readonly editable: boolean;
};

function componentValueKey(component: PackageSymbol, slot: string): string {
  return `${packageSymbolKey(component)}:${slot}`;
}

function processContexts(
  project: NleProject,
  composition: NleProject["compositions"][number],
  track: NleTrack,
  item: NleItem,
): readonly { context: NleProcessAuthoringContext; address: NleProcessAddress }[] {
  if (item.kind === "adjust") return [{
    context: {
      project, composition, track, item, process: item,
      parameters: resolveNleOperatorParameters(project, item.operator, item.parameters),
      scope: { kind: "adjust" },
    },
    address: { kind: "adjust", item: item.id },
  }];
  return [
    ...(item.picture?.processes ?? []).map((process) => ({
      context: {
        project, composition, track, item, process,
        parameters: resolveNleOperatorParameters(project, process.operator, process.parameters),
        scope: { kind: "occurrence" as const, medium: "picture" as const },
      },
      address: {
        kind: "occurrence" as const, item: item.id, medium: "picture" as const, process: process.id,
      },
    })),
    ...(item.audio?.processes ?? []).map((process) => ({
      context: {
        project, composition, track, item, process,
        parameters: resolveNleOperatorParameters(project, process.operator, process.parameters),
        scope: { kind: "occurrence" as const, medium: "audio" as const },
      },
      address: {
        kind: "occurrence" as const, item: item.id, medium: "audio" as const, process: process.id,
      },
    })),
  ];
}

function sceneSection(
  id: string,
  draft: NleInspectorSectionDraft,
  owner: NleInspectorSection["owner"],
  editable: boolean,
): NleInspectorSection {
  assertDraft(draft, `NLE Inspector section ${id}`);
  return {
    id,
    label: draft.label,
    domain: draft.domain,
    owner: structuredClone(owner),
    fields: draft.fields.map(({ operation, ...field }) => ({
      ...structuredClone(field),
      ...(operation !== undefined && editable ? { editable: true as const } : {}),
    })),
    ...(draft.collections === undefined ? {} : {
      collections: draft.collections.map((collection) => ({
        id: collection.id,
        label: collection.label,
        rows: collection.rows.map((row) => ({
          id: row.id,
          ...(row.label === undefined ? {} : { label: row.label }),
          fields: row.fields.map(({ operation, ...field }) => ({
            ...structuredClone(field),
            ...(operation !== undefined && editable ? { editable: true as const } : {}),
          })),
          ...(row.actions === undefined ? {} : {
            actions: row.actions.map(({ id, label }) => ({ id, label, enabled: editable })),
          }),
        })),
      })),
    }),
  };
}

export function createNleInspectorPresentationHost(
  contributions: readonly NleInspectorPresentationContribution[],
  authoring?: NleAuthoringHost,
): NleInspectorPresentationHost {
  const components = new Map<string, NleInspectorComponentPresentation>();
  const componentValues = new Map<string, NleInspectorComponentValuePresentation>();
  const operators = new Map<string, NleInspectorOperatorPresentation>();
  const transitions = new Map<string, NleInspectorTransitionPresentation>();
  for (const contribution of contributions) {
    assertContribution(contribution);
    for (const entry of contribution.transitions ?? []) {
      const key = packageSymbolKey(entry.operator);
      assert(!transitions.has(key), `NLE Inspector has multiple Transition presentations for ${key}.`);
      transitions.set(key, entry);
    }
    for (const entry of contribution.components) {
      const key = packageSymbolKey(entry.component);
      assert(!components.has(key), `NLE Inspector has multiple Component presentations for ${key}.`);
      components.set(key, entry);
    }
    for (const entry of contribution.operators) {
      const key = packageSymbolKey(entry.operator);
      assert(!operators.has(key), `NLE Inspector has multiple Operator presentations for ${key}.`);
      operators.set(key, entry);
    }
    for (const entry of contribution.componentValues) {
      const key = componentValueKey(entry.component, entry.slot);
      assert(!componentValues.has(key),
        `NLE Inspector has multiple Component value presentations for ${key}.`);
      componentValues.set(key, entry);
    }
  }

  const packageSections = (
    project: NleProject,
    editing: NleEditingContext,
    itemId: string,
  ): readonly ProjectedPackageSection[] => {
    const { composition, track, item } = locatedItem(project, editing, itemId);
    const writable = !editing.lockedTracks.has(track.id);
    const sections: ProjectedPackageSection[] = [];
    if (item.kind === "present" && item.source === "component") {
      const presentation = components.get(packageSymbolKey(item.component));
      if (presentation !== undefined) {
        const context = { project, composition, track, item };
        for (const draft of presentation.project(context)) {
          const id = `component:${draft.id}`;
          sections.push({
            section: sceneSection(id, draft, { kind: "package", symbol: item.component },
              writable && authoring?.hasComponentParameterAuthoring(item.component) === true),
            draft,
            context,
            editable: writable && authoring?.hasComponentParameterAuthoring(item.component) === true,
          });
        }
      }
      for (const binding of item.valueBindings ?? []) {
        const context = createNleComponentValueAuthoringContext(project, item.id, binding.slot);
        const component = item.component;
        const presentation = componentValues.get(componentValueKey(component, binding.slot));
        if (presentation === undefined) continue;
        const allWritable = context.users.every((user) =>
          !editing.lockedTracks.has(user.track.id));
        const editable = allWritable
          && authoring?.hasComponentValueAuthoring(component, binding.slot) === true;
        for (const draft of presentation.project(context)) {
          const id = `component-value:${binding.slot}:${draft.id}`;
          const owner = context.sharedValue === undefined
            ? { kind: "package" as const, symbol: item.component }
            : {
                kind: "shared-value" as const,
                ref: context.sharedValue.id,
                name: context.sharedValue.name,
                declaration: context.sharedValue.declaration,
                sharedBy: context.users.map((user) => user.item.id),
              };
          sections.push({
            section: sceneSection(id, draft, owner, editable),
            draft,
            context,
            componentValue: true,
            editable,
          });
        }
      }
    }
    for (const { context, address } of processContexts(project, composition, track, item)) {
      const presentation = operators.get(packageSymbolKey(context.process.operator));
      if (presentation === undefined) continue;
      const shared = context.process.parameters.kind === "shared"
        ? findNleOperatorSharedValue(project, context.process.parameters.ref) : undefined;
      const users = shared === undefined ? [] : indexNleProject(project).sharedValueUsers(shared.id);
      const operatorWritable = shared === undefined
        ? writable
        : users.every((user) => !editing.lockedTracks.has(user.track.id));
      for (const draft of presentation.project(context)) {
        const scope = address.kind === "adjust"
          ? "adjust"
          : `${address.medium}:${address.process}`;
        const id = `operator:${scope}:${draft.id}`;
        sections.push({
          section: sceneSection(id, draft, shared === undefined
            ? { kind: "package", symbol: context.process.operator }
            : {
                kind: "shared-value",
                ref: shared.id,
                name: shared.name,
                declaration: shared.declaration,
                sharedBy: users.map((user) => user.item.id),
              },
          operatorWritable && authoring?.hasOperatorParameterAuthoring(context.process.operator) === true),
          draft,
          context,
          address,
          editable: operatorWritable && authoring?.hasOperatorParameterAuthoring(context.process.operator) === true,
        });
      }
    }
    const ids = new Set<string>();
    for (const entry of sections) {
      assert(!ids.has(entry.section.id), `NLE Inspector repeats section ${entry.section.id}.`);
      ids.add(entry.section.id);
    }
    return sections;
  };

  const planPackageEdit = (section: ProjectedPackageSection, operation: unknown) => {
    assert(authoring !== undefined, "NLE Inspector package authoring is not installed.");
    if (section.componentValue === true) {
      return authoring.planComponentValueEdit(section.context as NleComponentValueAuthoringContext, operation);
    }
    if (section.address === undefined) {
      return authoring.planComponentParameterEdit(section.context as NleComponentAuthoringContext, operation);
    }
    return authoring.planProcessParameterEdit(section.context as NleProcessAuthoringContext, section.address, operation);
  };

  const transitionSections = (project: NleProject, editing: NleEditingContext, id: string) => {
    const composition = findNleComposition(project, editing.activeComposition);
    const transition = composition.transitions.find(value => value.id === id);
    assert(transition !== undefined, `NLE Transition ${id} is not in active Composition ${composition.id}.`);
    const { track, item: outgoing } = locatedItem(project, editing, transition.outgoing);
    const { item: incoming } = locatedItem(project, editing, transition.incoming);
    const editable = !editing.lockedTracks.has(track.id);
    const context = { project, composition, track, transition };
    const drafts = transitions.get(packageSymbolKey(transition.operator))?.project(context) ?? [];
    const writeParameters = editable && authoring?.hasTransitionParameterAuthoring(transition.operator) === true;
    const seen = new Set<string>();
    const sections = drafts.map(draft => {
      assert(!seen.has(draft.id), `NLE Transition Inspector repeats section ${draft.id}.`);
      seen.add(draft.id);
      return sceneSection(draft.id, draft, { kind: "package", symbol: transition.operator }, writeParameters);
    });
    const durationFrames = frames(subtractExactTemporalValues(nleItemEnd(outgoing), incoming.start), project);
    return { context, editable, sections, drafts, writeParameters, durationFrames };
  };

  return {
    transitionScene(project, editing, id) {
      const { context: { track, transition }, editable, sections, durationFrames } = transitionSections(project, editing, id);
      return { id, track: track.id, editable, sections, durationFrames, operator: transition.operator,
        outgoing: transition.outgoing, incoming: transition.incoming };
    },
    planTransitionEdit(project, editing, id, section, field, value) {
      const { context, drafts, writeParameters } = transitionSections(project, editing, id);
      assert(writeParameters && authoring !== undefined, `NLE Transition ${id} parameters are not editable in this session.`);
      const selected = drafts.find(draft => draft.id === section)?.fields.find(candidate => candidate.id === field);
      assert(selected?.operation !== undefined, `NLE Transition field ${section}.${field} is read-only.`);
      validateEdit(selected, value);
      return authoring.planTransitionParameterEdit(context, selected.operation(value));
    },
    scene(project, editing, id, observations = []) {
      const { composition, track, item } = locatedItem(project, editing, id);
      const writable = !editing.lockedTracks.has(track.id);
      const observedTitle = observations.find((observation) => observation.item === id)?.title;
      const displayedTitle = item.name ?? observedTitle ?? itemTitle(project, item);
      const sections: NleInspectorSection[] = [{
        id: "nle-occurrence",
        label: "Occurrence",
        domain: "when",
        owner: { kind: "nle" },
        fields: [{
          id: "name", label: "Name", control: "text", value: displayedTitle,
          ...(writable ? { editable: true as const } : {}),
        }, {
          id: "track", label: "Track", control: "readout", value: track.name,
        }, {
          id: "enabled", label: "Enabled", control: "boolean", value: item.enabled,
          ...(writable ? { editable: true as const } : {}),
        }, {
          id: "start", label: "Start", control: "number", value: frames(item.start, project), unit: "frames",
        }, {
          id: "duration", label: "Duration", control: "number", value: frames(item.duration, project), unit: "frames",
        }, {
          id: "mapping", label: "Time mapping", control: "readout",
          value: `${(item.kind === "present" ? item.sourceTime : item.controlTime).pieces.length} pieces`,
        }],
      }];
      if (item.kind === "present" && item.picture !== undefined) {
        const layout = resolveNlePictureLayout(project, item.picture.layout);
        const shared = "ref" in item.picture.layout
          ? findNlePictureLayoutSharedValue(project, item.picture.layout.ref) : undefined;
        const users = shared === undefined ? [] : indexNleProject(project).sharedValueUsers(shared.id);
        const layoutWritable = writable && users.every((user) =>
          !editing.lockedTracks.has(user.track.id));
        sections.push({
          id: "nle-picture-layout",
          label: "Picture layout",
          domain: "where",
          owner: shared === undefined ? { kind: "nle" } : {
            kind: "shared-value", ref: shared.id, name: shared.name,
            declaration: shared.declaration,
            sharedBy: users.map((user) => user.item.id),
          },
          fields: [
            { id: "x", label: "X", control: "number", value: layout.x, step: 1,
              ...(layoutWritable ? { editable: true as const } : {}) },
            { id: "y", label: "Y", control: "number", value: layout.y, step: 1,
              ...(layoutWritable ? { editable: true as const } : {}) },
            { id: "width", label: "Width", control: "number", value: layout.width, minimum: 1, step: 1,
              ...(layoutWritable ? { editable: true as const } : {}) },
            { id: "height", label: "Height", control: "number", value: layout.height, minimum: 1, step: 1,
              ...(layoutWritable ? { editable: true as const } : {}) },
            { id: "fit", label: "Fit", control: "select", value: layout.fit, options: [
              { value: "fill", label: "Fill" }, { value: "contain", label: "Contain" },
              { value: "cover", label: "Cover" },
            ], ...(layoutWritable ? { editable: true as const } : {}) },
            { id: "contentX", label: "Horizontal focus", control: "number", value: layout.contentX ?? 0.5,
              minimum: 0, maximum: 1, step: 0.01, ...(layoutWritable ? { editable: true as const } : {}) },
            { id: "contentY", label: "Vertical focus", control: "number", value: layout.contentY ?? 0.5,
              minimum: 0, maximum: 1, step: 0.01, ...(layoutWritable ? { editable: true as const } : {}) },
          ],
        });
      }
      if (item.kind === "present" && item.source === "component") {
        const compatibleValues = (slot: string) => project.sharedValues.filter((value) =>
          value.declaration.kind === "component"
          && value.declaration.slot === slot
          && value.declaration.component.package === item.component.package
          && value.declaration.component.symbol === item.component.symbol);
        for (const binding of item.valueBindings ?? []) {
          const shared = binding.kind === "shared" ? findNleComponentSharedValue(project, binding.ref) : undefined;
          const users = shared === undefined ? [] : indexNleProject(project).sharedValueUsers(shared.id);
          sections.push({
            id: `nle-component-value-binding:${binding.slot}`,
            label: `${binding.slot} ownership`,
            domain: "how",
            owner: shared === undefined ? { kind: "package", symbol: item.component } : {
              kind: "shared-value",
              ref: shared.id,
              name: shared.name,
              declaration: shared.declaration,
              sharedBy: users.map((user) => user.item.id),
            },
            fields: [{
              id: "binding",
              label: "Value",
              control: "select",
              value: shared === undefined ? "inline" : `shared:${shared.id}`,
              options: [
                { value: "inline", label: "This item" },
                ...compatibleValues(binding.slot).map((value) => ({
                  value: `shared:${value.id}`,
                  label: value.name,
                })),
              ],
              ...(writable ? { editable: true as const } : {}),
            }],
          });
        }
      }
      sections.push(...packageSections(project, editing, id).map((entry) => entry.section));
      const processes = item.kind !== "present" ? [] : (["picture", "audio"] as const).flatMap(medium =>
        (item[medium]?.processes ?? []).map(process => ({
          medium, id: process.id, label: process.operator.symbol, enabled: process.enabled, editable: writable,
          timing: projectNleProcessEdge(process.controlTime, project.editRate) ?? {
            edge: "mapping" as const,
            canAlign: exactTemporalRational(nleProcessControlDuration(process.controlTime)).numerator > 0n,
          },
        })));
      return { item: id, title: displayedTitle, sections, processes };
    },
    planEdit(project, editing, id, sectionId, fieldId, value) {
      const { composition, track, item } = locatedItem(project, editing, id);
      assert(!editing.lockedTracks.has(track.id),
        `NLE Track ${track.id} in Composition ${composition.id} is locked.`);
      if (sectionId === "nle-occurrence") {
        if (fieldId === "name") {
          assert(typeof value === "string", "NLE Inspector name requires text.");
          return { commands: [{ kind: "item.update", id, name: value.trim().length === 0 ? null : value }] };
        }
        if (fieldId === "enabled") {
          assert(typeof value === "boolean", "NLE Inspector enabled requires a boolean.");
          return { commands: [{ kind: "item.update", id, enabled: value }] };
        }
        throw new Error(`NLE Inspector field ${sectionId}.${fieldId} is read-only.`);
      }
      if (sectionId === "nle-picture-layout") {
        assert(item.kind === "present" && item.picture !== undefined,
          `NLE Item ${id} has no Picture layout.`);
        const layout = resolveNlePictureLayout(project, item.picture.layout);
        if ("ref" in item.picture.layout) {
          for (const user of indexNleProject(project).sharedValueUsers(item.picture.layout.ref)) {
            assert(!editing.lockedTracks.has(user.track.id),
              `NLE Track ${user.track.id} in Composition ${user.composition.id} is locked.`);
          }
        }
        if (fieldId === "x" || fieldId === "y" || fieldId === "width" || fieldId === "height") {
          assert(typeof value === "number" && Number.isFinite(value),
            `NLE Inspector layout ${fieldId} requires a finite number.`);
          return planNleSpatialEdit(project, id, {
            kind: "frame.resize",
            frame: { ...layout, [fieldId]: value },
          });
        }
        if (fieldId === "fit") {
          assert(value === "fill" || value === "contain" || value === "cover",
            "NLE Inspector fit is invalid.");
          return planNleSpatialEdit(project, id, { kind: "fit.set", fit: value });
        }
        if (fieldId === "contentX" || fieldId === "contentY") {
          assert(typeof value === "number", `NLE Inspector ${fieldId} requires a number.`);
          return planNleSpatialEdit(project, id, {
            kind: "focus.set",
            contentX: fieldId === "contentX" ? value : layout.contentX ?? 0.5,
            contentY: fieldId === "contentY" ? value : layout.contentY ?? 0.5,
          });
        }
        throw new Error(`Unknown NLE Inspector Picture field: ${fieldId}.`);
      }
      const componentValuePrefix = "nle-component-value-binding:";
      if (sectionId.startsWith(componentValuePrefix)) {
        assert(item.kind === "present" && item.source === "component",
          `NLE Item ${id} is not a Component Present.`);
        assert(fieldId === "binding" && typeof value === "string",
          `NLE Inspector field ${sectionId}.${fieldId} is invalid.`);
        const slot = sectionId.slice(componentValuePrefix.length);
        return value === "inline"
          ? planNleComponentValueEdit(project, id, { kind: "unlink", slot })
          : value.startsWith("shared:")
            ? planNleComponentValueEdit(project, id, { kind: "link", slot, ref: value.slice("shared:".length) })
            : (() => { throw new Error(`NLE Inspector Component value selection ${value} is invalid.`); })();
      }
      const packageSection = packageSections(project, editing, id)
        .find((entry) => entry.section.id === sectionId);
      assert(packageSection !== undefined, `Unknown NLE Inspector section: ${sectionId}.`);
      const field = packageSection.draft.fields.find((candidate) => candidate.id === fieldId)
        ?? packageSection.draft.collections?.flatMap((collection) => collection.rows)
          .flatMap((row) => row.fields).find((candidate) => candidate.id === fieldId);
      assert(field !== undefined && field.operation !== undefined,
        `NLE Inspector field ${sectionId}.${fieldId} is read-only.`);
      assert(packageSection.editable, `NLE Inspector section ${sectionId} is not editable in this session.`);
      validateEdit(field, value);
      return planPackageEdit(packageSection, field.operation(value));
    },
    planRowAction(project, editing, id, address) {
      const { composition, track } = locatedItem(project, editing, id);
      assert(!editing.lockedTracks.has(track.id),
        `NLE Track ${track.id} in Composition ${composition.id} is locked.`);
      const section = packageSections(project, editing, id).find(entry => entry.section.id === address.section);
      assert(section?.editable === true, `NLE Inspector section ${address.section} is not editable in this session.`);
      const action = section.draft.collections?.find(collection => collection.id === address.collection)
        ?.rows.find(row => row.id === address.row)?.actions?.find(action => action.id === address.action);
      assert(action !== undefined, `Unknown NLE Inspector action ${address.action} on row ${address.row}.`);
      return planPackageEdit(section, action.operation());
    },
  };
}
