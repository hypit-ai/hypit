import type { PackageSymbol } from "@hypit/audiovisual";
import { exactTemporalRational } from "@hypit/temporal/algebra";
import { planNleSpatialEdit } from "../spatial-authoring.js";
import { indexNleProject } from "../indexing.js";
import {
  findNleOperatorSharedValue,
  findNlePictureLayoutSharedValue,
  resolveNleOperatorParameters,
  resolveNlePictureLayout,
} from "../project.js";
import type { NleItem, NleProject, NleTrack } from "../types.js";
import type { NleTransaction } from "../transaction.js";
import type {
  NleAuthoringHost,
  NleComponentTemporalAuthoringContext,
  NleComponentSharedValueAuthoringContext,
  NleProcessAddress,
  NleProcessAuthoringContext,
} from "./authoring.js";
import { createNleComponentSharedValueAuthoringContext } from "./authoring.js";
import { assertContributionOwner, packageSymbolKey } from "./symbol.js";
import type {
  NleInspectorFieldDraft,
  NleInspectorScene,
  NleInspectorSection,
  NleInspectorSectionDraft,
  NleTimelineItemObservation,
  NleView,
} from "./types.js";
import { assertNleViewForProject, nleViewTrackLocked } from "./view.js";

export const nleInspectorPresentationContributionKind = "hypit.nle-inspector-presentation";

export type NleInspectorComponentPresentation = {
  readonly component: PackageSymbol;
  readonly project: (context: NleComponentTemporalAuthoringContext) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorOperatorPresentation = {
  readonly operator: PackageSymbol;
  readonly project: (context: NleProcessAuthoringContext) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorComponentSharedValuePresentation = {
  readonly component: PackageSymbol;
  readonly slot: string;
  readonly project: (context: NleComponentSharedValueAuthoringContext) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorPresentationContribution = {
  readonly kind: typeof nleInspectorPresentationContributionKind;
  readonly package: string;
  readonly components: readonly NleInspectorComponentPresentation[];
  readonly componentSharedValues: readonly NleInspectorComponentSharedValuePresentation[];
  readonly operators: readonly NleInspectorOperatorPresentation[];
};

export type NleInspectorPresentationHost = {
  readonly scene: (
    project: NleProject,
    view: NleView,
    item: string,
    observations?: readonly NleTimelineItemObservation[],
  ) => NleInspectorScene;
  readonly planEdit: (
    project: NleProject,
    view: NleView,
    item: string,
    section: string,
    field: string,
    value: string | number | boolean,
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
  assert(Array.isArray(value.fields) && value.fields.length > 0, `${label}.fields must not be empty.`);
  const fields = new Set<string>();
  for (const [index, field] of value.fields.entries()) {
    assertField(field, `${label}.fields[${index}]`);
    assert(!fields.has(field.id), `${label} repeats field ${field.id}.`);
    fields.add(field.id);
  }
}

function assertContribution(value: NleInspectorPresentationContribution): void {
  assert(value !== null && typeof value === "object", "NLE Inspector contribution must be an object.");
  assert(Array.isArray(value.components) && Array.isArray(value.componentSharedValues)
    && Array.isArray(value.operators),
    "NLE Inspector contribution declarations must be arrays.");
  assertContributionOwner(value.package, [
    ...value.components.map((entry) => entry.component),
    ...value.componentSharedValues.map((entry) => entry.component),
    ...value.operators.map((entry) => entry.operator),
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
  for (const entry of value.componentSharedValues) {
    assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(entry.slot),
      "NLE Inspector Component Shared Value slot is invalid.");
    const key = `component-shared-value:${componentSharedValueKey(entry.component, entry.slot)}`;
    assert(!keys.has(key), `NLE Inspector contribution repeats ${key}.`);
    keys.add(key);
    assert(typeof entry.project === "function", `NLE Inspector ${key} projector is not callable.`);
  }
}

export function createNleInspectorPresentationContribution(value: {
  readonly package: string;
  readonly components?: readonly NleInspectorComponentPresentation[];
  readonly componentSharedValues?: readonly NleInspectorComponentSharedValuePresentation[];
  readonly operators?: readonly NleInspectorOperatorPresentation[];
}): NleInspectorPresentationContribution {
  const contribution: NleInspectorPresentationContribution = {
    kind: nleInspectorPresentationContributionKind,
    package: value.package,
    components: [...(value.components ?? [])],
    componentSharedValues: [...(value.componentSharedValues ?? [])],
    operators: [...(value.operators ?? [])],
  };
  assertContribution(contribution);
  return contribution;
}

function frames(value: NleItem["start"], view: NleView): number {
  const exact = exactTemporalRational(value);
  return Number(exact.numerator) / Number(exact.denominator)
    * view.editRate.numerator / view.editRate.denominator;
}

function locatedItem(project: NleProject, view: NleView, id: string) {
  const composition = project.compositions.find((candidate) => candidate.id === view.activeComposition)!;
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
  readonly context: NleComponentTemporalAuthoringContext
    | NleComponentSharedValueAuthoringContext
    | NleProcessAuthoringContext;
  readonly componentSharedValue?: true;
  readonly address?: NleProcessAddress;
  readonly editable: boolean;
};

function componentSharedValueKey(component: PackageSymbol, slot: string): string {
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
  };
}

export function createNleInspectorPresentationHost(
  contributions: readonly NleInspectorPresentationContribution[],
  authoring?: NleAuthoringHost,
): NleInspectorPresentationHost {
  const components = new Map<string, NleInspectorComponentPresentation>();
  const componentSharedValues = new Map<string, NleInspectorComponentSharedValuePresentation>();
  const operators = new Map<string, NleInspectorOperatorPresentation>();
  for (const contribution of contributions) {
    assertContribution(contribution);
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
    for (const entry of contribution.componentSharedValues) {
      const key = componentSharedValueKey(entry.component, entry.slot);
      assert(!componentSharedValues.has(key),
        `NLE Inspector has multiple Component Shared Value presentations for ${key}.`);
      componentSharedValues.set(key, entry);
    }
  }

  const packageSections = (
    project: NleProject,
    view: NleView,
    itemId: string,
  ): readonly ProjectedPackageSection[] => {
    const { composition, track, item } = locatedItem(project, view, itemId);
    const writable = !nleViewTrackLocked(view, composition.id, track.id);
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
      for (const binding of item.sharedValueBindings ?? []) {
        const context = createNleComponentSharedValueAuthoringContext(project, binding.ref);
        const { component, slot } = context.value.declaration;
        const presentation = componentSharedValues.get(componentSharedValueKey(component, slot));
        if (presentation === undefined) continue;
        const allWritable = context.users.every((user) =>
          !nleViewTrackLocked(view, user.composition.id, user.track.id));
        const editable = allWritable
          && authoring?.hasComponentSharedValueAuthoring(component, slot) === true;
        for (const draft of presentation.project(context)) {
          const id = `shared-value:${context.value.id}:${draft.id}`;
          sections.push({
            section: sceneSection(id, draft, {
              kind: "shared-value",
              ref: context.value.id,
              name: context.value.name,
              declaration: context.value.declaration,
              sharedBy: context.users.map((user) => user.item.id),
            }, editable),
            draft,
            context,
            componentSharedValue: true,
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
        : users.every((user) => !nleViewTrackLocked(view, user.composition.id, user.track.id));
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

  return {
    scene(project, view, id, observations = []) {
      assertNleViewForProject(view, project);
      const { composition, track, item } = locatedItem(project, view, id);
      const writable = !nleViewTrackLocked(view, composition.id, track.id);
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
          id: "start", label: "Start", control: "number", value: frames(item.start, view), unit: "frames",
        }, {
          id: "duration", label: "Duration", control: "number", value: frames(item.duration, view), unit: "frames",
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
          !nleViewTrackLocked(view, user.composition.id, user.track.id));
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
      sections.push(...packageSections(project, view, id).map((entry) => entry.section));
      return { item: id, title: displayedTitle, sections };
    },
    planEdit(project, view, id, sectionId, fieldId, value) {
      assertNleViewForProject(view, project);
      const { composition, track, item } = locatedItem(project, view, id);
      assert(!nleViewTrackLocked(view, composition.id, track.id),
        `NLE View Track ${track.id} in Composition ${composition.id} is locked.`);
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
            assert(!nleViewTrackLocked(view, user.composition.id, user.track.id),
              `NLE View Track ${user.track.id} in Composition ${user.composition.id} is locked.`);
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
      const packageSection = packageSections(project, view, id)
        .find((entry) => entry.section.id === sectionId);
      assert(packageSection !== undefined, `Unknown NLE Inspector section: ${sectionId}.`);
      const field = packageSection.draft.fields.find((candidate) => candidate.id === fieldId);
      assert(field !== undefined && field.operation !== undefined,
        `NLE Inspector field ${sectionId}.${fieldId} is read-only.`);
      assert(packageSection.editable, `NLE Inspector section ${sectionId} is not editable in this View.`);
      validateEdit(field, value);
      const operation = field.operation(value);
      assert(authoring !== undefined, "NLE Inspector package authoring is not installed.");
      if (packageSection.componentSharedValue === true) {
        return authoring.planComponentSharedValueEdit(
          packageSection.context as NleComponentSharedValueAuthoringContext,
          operation,
        );
      }
      if (packageSection.address === undefined) {
        return authoring.planComponentParameterEdit(
          packageSection.context as NleComponentTemporalAuthoringContext,
          operation,
        );
      }
      return authoring.planProcessParameterEdit(
        packageSection.context as NleProcessAuthoringContext,
        packageSection.address,
        operation,
      );
    },
  };
}
