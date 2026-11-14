import type { Facet } from "@hypit/facet";
import { canonicalize, type CanonicalValue } from "@hypit/protocol";
import {
  findNleItem,
  findNleComponentValue,
  findNlePictureLayout,
  indexNleComposition,
  nlePackageSymbolKey,
  resolveNleComponentSharedValue,
  resolveNlePictureLayout,
  type NleAdjustmentItem,
  type NleAuthoringHost,
  type NleComponentItem,
  type NleComponentValue,
  type NleItem,
  type NleOperatorApplicationAddress,
  type NleOperatorParameterAuthoringContext,
  type NlePackageSymbol,
  type NlePresentItem,
  type NleProject,
  type NleTrack,
} from "@hypit/nle";

import type { NleTimelineView } from "./types.js";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export const nleInspectorPresentationFacetKind = "hypit.nle-inspector-presentation";

export type NleInspectorDomain = "where" | "when" | "how";
export type NleInspectorControl = "readout" | "text" | "number" | "boolean" | "select" | "color";

export type NleInspectorPage = {
  readonly id: string;
  readonly label: string;
};

export type NleInspectorFieldRow = {
  readonly id: string;
  readonly label: string;
};

export type NleInspectorField = {
  readonly id: string;
  readonly label: string;
  readonly control: NleInspectorControl;
  readonly value: string | number | boolean;
  readonly unit?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /** Consecutive fields with the same row ID render as one compact compound row. */
  readonly row?: NleInspectorFieldRow;
  /** Present only when the selected package exposes one semantic edit for this field. */
  readonly editable?: true;
};

export type NleInspectorFieldDraft = Omit<NleInspectorField, "editable"> & {
  /** Host-only semantic operation projector. Functions never enter the browser Scene. */
  readonly edit?: (value: string | number | boolean) => CanonicalValue;
};

export type NleInspectorSectionOwner =
  | { readonly kind: "nle" }
  | { readonly kind: "package"; readonly symbol: NlePackageSymbol }
  | {
      readonly kind: "component-value";
      readonly component: NlePackageSymbol;
      readonly slot: string;
      readonly ref: string;
      readonly name: string;
      readonly sharedBy: readonly string[];
    }
  | {
      readonly kind: "picture-layout";
      readonly ref: string;
      readonly name: string;
      readonly sharedBy: readonly string[];
    }
  | {
      readonly kind: "media";
      readonly media: string;
      readonly asset: string;
      readonly sharedBy: readonly string[];
    }
  | { readonly kind: "host" };

export type NleInspectorSection = {
  readonly id: string;
  readonly label: string;
  readonly domain: NleInspectorDomain;
  /** Optional task page inside a domain. The UI hides the page strip when only one page exists. */
  readonly page?: NleInspectorPage;
  readonly owner: NleInspectorSectionOwner;
  readonly fields: readonly NleInspectorField[];
};

export type NleInspectorScene = {
  readonly format: "hypit.nle-inspector-scene@1";
  readonly item: string;
  readonly revision: number;
  readonly title: string;
  readonly sections: readonly NleInspectorSection[];
};

export type NleInspectorObservation = {
  readonly item: string;
  /** Host/package-derived default used only when the occurrence has no authored name. */
  readonly title?: string;
  readonly sections: readonly NleInspectorSection[];
};

export type NleInspectorSectionDraft = Omit<NleInspectorSection, "owner" | "fields"> & {
  readonly owner?: { readonly kind: "item" } | { readonly kind: "binding"; readonly slot: string };
  readonly fields: readonly NleInspectorFieldDraft[];
};

export type NleInspectorPackageEdit =
  | { readonly kind: "component"; readonly operation: CanonicalValue }
  | {
      readonly kind: "operator";
      readonly address: NleOperatorApplicationAddress;
      readonly operation: CanonicalValue;
    }
  | { readonly kind: "component-value"; readonly value: string; readonly operation: CanonicalValue };

export type NleInspectorComponentPresentation = {
  readonly component: NlePackageSymbol;
  readonly project: (context: {
    readonly project: NleProject;
    readonly track: NleTrack;
    readonly item: NleComponentItem;
  }) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorOperatorPresentation = {
  readonly operator: NlePackageSymbol;
  readonly project: (context: NleOperatorParameterAuthoringContext) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorComponentValuePresentation = {
  readonly component: NlePackageSymbol;
  readonly slot: string;
  readonly project: (context: {
    readonly project: NleProject;
    readonly value: NleComponentValue;
    readonly users: readonly NleComponentItem[];
  }) => readonly NleInspectorSectionDraft[];
};

export type NleInspectorPresentationPackage = {
  readonly components?: readonly NleInspectorComponentPresentation[];
  readonly componentValues?: readonly NleInspectorComponentValuePresentation[];
  readonly operators?: readonly NleInspectorOperatorPresentation[];
};

export type NleInspectorPresentationFacet = Facet & {
  readonly kind: typeof nleInspectorPresentationFacetKind;
  readonly implementation: NleInspectorPresentationPackage;
};

export type NleInspectorPresentationHost = {
  readonly scene: (
    project: NleProject,
    view: NleTimelineView,
    item: string,
    observations?: readonly NleInspectorObservation[],
  ) => NleInspectorScene;
  readonly packageEdit: (
    project: NleProject,
    item: string,
    section: string,
    field: string,
    value: string | number | boolean,
  ) => NleInspectorPackageEdit;
};

const domains = new Set<NleInspectorDomain>(["where", "when", "how"]);
const controls = new Set<NleInspectorControl>(["readout", "text", "number", "boolean", "select", "color"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSymbol(value: NlePackageSymbol, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(typeof value.name === "string" && value.name.length > 0, `${label}.name is invalid.`);
  nlePackageSymbolKey(value);
}

function assertField(value: NleInspectorFieldDraft, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(typeof value.id === "string" && value.id.length > 0, `${label}.id is invalid.`);
  assert(typeof value.label === "string" && value.label.length > 0, `${label}.label is invalid.`);
  assert(controls.has(value.control), `${label}.control is invalid.`);
  assert(["string", "number", "boolean"].includes(typeof value.value), `${label}.value is invalid.`);
  if (typeof value.value === "number") assert(Number.isFinite(value.value), `${label}.value must be finite.`);
  if (value.minimum !== undefined) assert(Number.isFinite(value.minimum), `${label}.minimum must be finite.`);
  if (value.maximum !== undefined) assert(Number.isFinite(value.maximum), `${label}.maximum must be finite.`);
  if (value.step !== undefined) assert(Number.isFinite(value.step) && value.step > 0, `${label}.step is invalid.`);
  if (value.minimum !== undefined && value.maximum !== undefined) {
    assert(value.minimum <= value.maximum, `${label} numeric bounds are invalid.`);
  }
  if (value.control !== "number") {
    assert(value.minimum === undefined && value.maximum === undefined && value.step === undefined,
      `${label} numeric bounds belong only to number fields.`);
  }
  if (value.control === "number") assert(typeof value.value === "number", `${label}.value must be a number.`);
  if (value.control === "boolean") assert(typeof value.value === "boolean", `${label}.value must be a boolean.`);
  if (value.control === "select") {
    assert(typeof value.value === "string" && Array.isArray(value.options) && value.options.length > 0,
      `${label} select options are required.`);
    assert(value.options.some((option) => option.value === value.value), `${label} select value is not an option.`);
  } else {
    assert(value.options === undefined, `${label}.options are only valid for select fields.`);
  }
  if (value.row !== undefined) {
    assert(value.row !== null && typeof value.row === "object" && !Array.isArray(value.row), `${label}.row is invalid.`);
    assert(typeof value.row.id === "string" && value.row.id.length > 0, `${label}.row.id is invalid.`);
    assert(typeof value.row.label === "string" && value.row.label.length > 0, `${label}.row.label is invalid.`);
  }
  assert(value.edit === undefined || typeof value.edit === "function", `${label}.edit is not callable.`);
}

function assertSectionBody(
  value: Pick<NleInspectorSectionDraft, "id" | "label" | "domain" | "page" | "fields">,
  label: string,
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(typeof value.id === "string" && value.id.length > 0, `${label}.id is invalid.`);
  assert(typeof value.label === "string" && value.label.length > 0, `${label}.label is invalid.`);
  assert(domains.has(value.domain), `${label}.domain is invalid.`);
  if (value.page !== undefined) {
    assert(value.page !== null && typeof value.page === "object" && !Array.isArray(value.page), `${label}.page is invalid.`);
    assert(typeof value.page.id === "string" && value.page.id.length > 0, `${label}.page.id is invalid.`);
    assert(typeof value.page.label === "string" && value.page.label.length > 0, `${label}.page.label is invalid.`);
  }
  assert(Array.isArray(value.fields) && value.fields.length > 0, `${label}.fields must not be empty.`);
  const ids = new Set<string>();
  for (const [index, field] of value.fields.entries()) {
    assertField(field, `${label}.fields[${index}]`);
    assert(!ids.has(field.id), `${label} repeats field ${field.id}.`);
    ids.add(field.id);
  }
}

function assertDraft(value: NleInspectorSectionDraft, label: string): void {
  assertSectionBody(value, label);
  if (value.owner !== undefined) {
    assert(value.owner.kind === "item" || value.owner.kind === "binding", `${label}.owner is invalid.`);
    if (value.owner.kind === "binding") {
      assert(typeof value.owner.slot === "string" && value.owner.slot.length > 0, `${label}.owner.slot is invalid.`);
    }
  }
}

function assertPackage(value: NleInspectorPresentationPackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "NLE Inspector presentation package must be an object.");
  const keys = new Set<string>();
  for (const presentation of value.components ?? []) {
    assertSymbol(presentation.component, "NLE Inspector Component symbol");
    const key = `component:${nlePackageSymbolKey(presentation.component)}`;
    assert(!keys.has(key), `NLE Inspector presentation package repeats ${key}.`);
    assert(typeof presentation.project === "function", `NLE Inspector ${key} projector is not callable.`);
    keys.add(key);
  }
  for (const presentation of value.componentValues ?? []) {
    assertSymbol(presentation.component, "NLE Inspector Component value symbol");
    assert(typeof presentation.slot === "string" && presentation.slot.length > 0,
      "NLE Inspector Component value slot is invalid.");
    const key = `component-value:${nlePackageSymbolKey(presentation.component)}:${presentation.slot}`;
    assert(!keys.has(key), `NLE Inspector presentation package repeats ${key}.`);
    assert(typeof presentation.project === "function", `NLE Inspector ${key} projector is not callable.`);
    keys.add(key);
  }
  for (const presentation of value.operators ?? []) {
    assertSymbol(presentation.operator, "NLE Inspector Operator symbol");
    const key = `operator:${nlePackageSymbolKey(presentation.operator)}`;
    assert(!keys.has(key), `NLE Inspector presentation package repeats ${key}.`);
    assert(typeof presentation.project === "function", `NLE Inspector ${key} projector is not callable.`);
    keys.add(key);
  }
}

function frameNumber(value: ExactTemporalValue, view: NleTimelineView): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator
    * view.editRate.numerator / view.editRate.denominator;
}

function itemTitle(item: NleItem): string {
  if (item.name !== undefined) return item.name;
  if (item.kind === "adjustment") return item.operator.name;
  if (item.source === "media") {
    const parts = item.asset.path.split("/");
    return parts[parts.length - 1]!.replace(/\.media\.json$/u, "");
  }
  if (item.source === "component") return item.component.name;
  return item.composition.name;
}

function allItems(project: NleProject): readonly NleItem[] {
  return project.tracks.flatMap((track) => track.items);
}

function componentValueKey(component: NlePackageSymbol, slot: string): string {
  return `${nlePackageSymbolKey(component)}:${slot}`;
}

function componentValueUsers(project: NleProject, ref: string): readonly NleComponentItem[] {
  return indexNleComposition(project).componentValueUsers(ref).flatMap(({ item }) =>
    item.kind === "present" && item.source === "component" ? [item] : []);
}

function itemTracksWritable(project: NleProject, view: NleTimelineView, items: readonly string[]): boolean {
  const affected = new Set(items);
  const locked = new Set(view.tracks.filter((state) => state.locked).map((state) => state.track));
  return !project.tracks.some((track) => locked.has(track.id)
    && track.items.some((item) => affected.has(item.id)));
}

function componentValueSectionId(ref: string, section: string): string {
  return `component-value:${ref}:${section}`;
}

function operatorSectionId(address: NleOperatorApplicationAddress, section: string): string {
  return address.kind === "adjustment"
    ? section
    : `operator:${encodeURIComponent(address.medium)}:${encodeURIComponent(address.application)}:${section}`;
}

type NleInspectorPackageSectionContext =
  | {
      readonly kind: "component";
      readonly item: NleComponentItem;
      readonly symbol: NlePackageSymbol;
    }
  | {
      readonly kind: "operator";
      readonly item: NleAdjustmentItem | NlePresentItem;
      readonly symbol: NlePackageSymbol;
      readonly address: NleOperatorApplicationAddress;
    };

function packageSections(
  project: NleProject,
  context: NleInspectorPackageSectionContext,
  drafts: readonly NleInspectorSectionDraft[],
  authoringInstalled: boolean,
): readonly NleInspectorSection[] {
  const ids = new Set<string>();
  return drafts.map((value, index) => {
    const label = `NLE Inspector section ${index}`;
    assertDraft(value, label);
    const id = context.kind === "operator" ? operatorSectionId(context.address, value.id) : value.id;
    assert(!ids.has(id), `NLE Inspector repeats section ${id}.`);
    ids.add(id);
    let owner: NleInspectorSectionOwner = { kind: "package", symbol: structuredClone(context.symbol) };
    if (value.owner?.kind === "binding") {
      assert(value.fields.every((field) => field.edit === undefined),
        `NLE Inspector shared binding section ${value.id} cannot edit Item parameters.`);
      assert(context.kind === "component",
        `NLE Inspector Operator section ${value.id} cannot own a binding.`);
      const resource = resolveNleComponentSharedValue(project, context.item, value.owner.slot);
      owner = {
        kind: "component-value",
        component: structuredClone(resource.component),
        slot: resource.slot,
        ref: resource.id,
        name: resource.name,
        sharedBy: allItems(project).flatMap((candidate) => candidate.kind === "present"
          && candidate.source === "component"
          && candidate.sharedValues?.some((reference) => reference.ref === resource.id)
          ? [candidate.id] : []),
      };
    }
    return {
      id,
      label: value.label,
      domain: value.domain,
      ...(value.page === undefined ? {} : { page: structuredClone(value.page) }),
      owner,
      fields: value.fields.map(({ edit, ...field }) => ({
        ...structuredClone(field),
        ...(edit === undefined || !authoringInstalled ? {} : { editable: true as const }),
      })),
    };
  });
}

function operatorContexts(
  project: NleProject,
  track: NleTrack,
  item: NleItem,
): readonly NleOperatorParameterAuthoringContext[] {
  if (item.kind === "adjustment") {
    return [{
      project,
      track,
      item,
      application: item,
      address: { kind: "adjustment", item: item.id },
      medium: track.kind,
    }];
  }
  return [
    ...(item.picture?.operators ?? []).map((application) => ({
      project,
      track,
      item,
      application,
      address: {
        kind: "occurrence" as const,
        item: item.id,
        medium: "picture" as const,
        application: application.id,
      },
      medium: "picture" as const,
    })),
    ...(item.audio?.operators ?? []).map((application) => ({
      project,
      track,
      item,
      application,
      address: {
        kind: "occurrence" as const,
        item: item.id,
        medium: "audio" as const,
        application: application.id,
      },
      medium: "audio" as const,
    })),
  ];
}

function editableValue(field: NleInspectorFieldDraft, value: string | number | boolean): void {
  if (field.control === "number") {
    assert(typeof value === "number" && Number.isFinite(value),
      `NLE Inspector field ${field.id} requires a finite number.`);
    assert(field.minimum === undefined || value >= field.minimum,
      `NLE Inspector field ${field.id} is below its minimum.`);
    assert(field.maximum === undefined || value <= field.maximum,
      `NLE Inspector field ${field.id} is above its maximum.`);
  }
  else if (field.control === "boolean") assert(typeof value === "boolean",
    `NLE Inspector field ${field.id} requires a boolean.`);
  else assert(typeof value === "string", `NLE Inspector field ${field.id} requires text.`);
  if (field.control === "select") {
    assert(field.options?.some((option) => option.value === value),
      `NLE Inspector field ${field.id} value is not an option.`);
  }
}

function sharedSections(
  project: NleProject,
  view: NleTimelineView,
  value: NleComponentValue,
  drafts: readonly NleInspectorSectionDraft[],
  authoringInstalled: boolean,
): readonly NleInspectorSection[] {
  const ids = new Set<string>();
  const users = componentValueUsers(project, value.id);
  const writable = authoringInstalled && itemTracksWritable(project, view, users.map((item) => item.id));
  return drafts.map((draft, index) => {
    const label = `NLE Inspector Component value section ${index}`;
    assertDraft(draft, label);
    assert(draft.owner === undefined || draft.owner.kind === "item", `${label}.owner cannot redirect a shared value.`);
    assert(!ids.has(draft.id), `NLE Inspector Component value repeats section ${draft.id}.`);
    ids.add(draft.id);
    return {
      id: componentValueSectionId(value.id, draft.id),
      label: draft.label,
      domain: draft.domain,
      ...(draft.page === undefined ? {} : { page: structuredClone(draft.page) }),
      owner: {
        kind: "component-value",
        component: structuredClone(value.component),
        slot: value.slot,
        ref: value.id,
        name: value.name,
        sharedBy: users.map((item) => item.id),
      },
      fields: draft.fields.map(({ edit, ...field }) => ({
        ...structuredClone(field),
        ...(edit === undefined || !writable ? {} : { editable: true as const }),
      })),
    };
  });
}

function coreSections(
  project: NleProject,
  view: NleTimelineView,
  track: NleTrack,
  item: NleItem,
  displayedTitle: string,
): NleInspectorSection[] {
  const occurrenceEditable = view.tracks.some((state) => state.track === track.id && state.locked)
    ? {} : { editable: true as const };
  const sections: NleInspectorSection[] = [{
    id: "nle-occurrence",
    label: "片段",
    domain: "when",
    page: { id: "clip", label: "片段" },
    owner: { kind: "nle" },
    fields: [
      { id: "name", label: "名称", control: "text", value: displayedTitle, ...occurrenceEditable },
      { id: "track", label: "轨道", control: "readout", value: track.name },
      { id: "enabled", label: "启用", control: "boolean", value: item.enabled },
      { id: "start", label: "开始", control: "number", value: frameNumber(item.start, view), unit: "帧" },
      { id: "duration", label: "时长", control: "number", value: frameNumber(item.duration, view), unit: "帧" },
      {
        id: item.kind === "present" ? "source-pieces" : "control-pieces",
        label: item.kind === "present" ? "源时间映射" : "控制时间映射",
        control: "readout",
        value: `${(item.kind === "present" ? item.sourceTime : item.controlTime).pieces.length} 段`,
      },
    ],
  }];
  if (item.kind === "present" && item.picture !== undefined) {
    const layout = resolveNlePictureLayout(project, item.picture.layout);
    const layoutSource = item.picture.layout;
    const owner: NleInspectorSectionOwner = "ref" in layoutSource ? (() => {
      const resource = findNlePictureLayout(project, layoutSource.ref);
      return {
        kind: "picture-layout",
        ref: resource.id,
        name: resource.name,
        sharedBy: allItems(project).flatMap((candidate) => candidate.kind === "present"
          && candidate.picture !== undefined && "ref" in candidate.picture.layout
          && candidate.picture.layout.ref === resource.id ? [candidate.id] : []),
      };
    })() : { kind: "nle" };
    const affectedItems = owner.kind === "picture-layout" ? new Set(owner.sharedBy) : new Set([item.id]);
    const editable = !project.tracks.some((candidate) =>
      view.tracks.some((state) => state.track === candidate.id && state.locked)
      && candidate.items.some((candidateItem) => affectedItems.has(candidateItem.id)));
    const canEdit = editable ? { editable: true as const } : {};
    sections.push({
      id: "nle-picture-layout",
      label: "画面布局",
      domain: "where",
      page: { id: "layout", label: "布局" },
      owner,
      fields: [
        { id: "x", label: "X", control: "number", value: layout.x, step: 1, ...canEdit },
        { id: "y", label: "Y", control: "number", value: layout.y, step: 1, ...canEdit },
        { id: "width", label: "宽度", control: "number", value: layout.width,
          minimum: 1, step: 1, ...canEdit },
        { id: "height", label: "高度", control: "number", value: layout.height,
          minimum: 1, step: 1, ...canEdit },
        { id: "fit", label: "适配", control: "select", value: layout.fit, options: [
          { value: "fill", label: "填满" }, { value: "contain", label: "包含" }, { value: "cover", label: "覆盖" },
        ], ...canEdit },
        { id: "contentX", label: "横向焦点", control: "number", value: layout.contentX ?? 0.5,
          minimum: 0, maximum: 1, step: 0.01, ...canEdit },
        { id: "contentY", label: "纵向焦点", control: "number", value: layout.contentY ?? 0.5,
          minimum: 0, maximum: 1, step: 0.01, ...canEdit },
      ],
    });
  }
  return sections;
}

export function createNleInspectorPresentationFacet(
  value: NleInspectorPresentationPackage,
): NleInspectorPresentationFacet {
  assertPackage(value);
  return { kind: nleInspectorPresentationFacetKind, implementation: value };
}

export function nleInspectorPresentationPackagesFromFacets(
  facets: readonly Facet[],
): readonly NleInspectorPresentationPackage[] {
  return facets.flatMap((facet) => facet.kind === nleInspectorPresentationFacetKind
    ? [(facet as NleInspectorPresentationFacet).implementation]
    : []);
}

export function createNleInspectorPresentationHost(
  packages: readonly NleInspectorPresentationPackage[],
  authoring?: Pick<NleAuthoringHost,
    "hasComponentParameterAuthoring" | "hasComponentValueAuthoring" | "hasOperatorParameterAuthoring">,
): NleInspectorPresentationHost {
  const components = new Map<string, NleInspectorComponentPresentation>();
  const componentValues = new Map<string, NleInspectorComponentValuePresentation>();
  const operators = new Map<string, NleInspectorOperatorPresentation>();
  for (const value of packages) {
    assertPackage(value);
    for (const presentation of value.components ?? []) {
      const key = nlePackageSymbolKey(presentation.component);
      assert(!components.has(key), `NLE Inspector has multiple Component presentations for ${key}.`);
      components.set(key, presentation);
    }
    for (const presentation of value.componentValues ?? []) {
      const key = componentValueKey(presentation.component, presentation.slot);
      assert(!componentValues.has(key), `NLE Inspector has multiple Component value presentations for ${key}.`);
      componentValues.set(key, presentation);
    }
    for (const presentation of value.operators ?? []) {
      const key = nlePackageSymbolKey(presentation.operator);
      assert(!operators.has(key), `NLE Inspector has multiple Operator presentations for ${key}.`);
      operators.set(key, presentation);
    }
  }
  return {
    scene(project, view, id, observations = []) {
      const { track, item } = findNleItem(project, id);
      const observedTitle = observations.find((observation) => observation.item === id
        && observation.title !== undefined)?.title;
      if (observedTitle !== undefined) {
        assert(typeof observedTitle === "string" && observedTitle.trim().length > 0,
          `NLE Inspector observation title for ${id} is empty.`);
      }
      const displayedTitle = item.name ?? observedTitle ?? itemTitle(item);
      const sections = coreSections(project, view, track, item, displayedTitle);
      for (const context of operatorContexts(project, track, item)) {
        const presentation = operators.get(nlePackageSymbolKey(context.application.operator));
        if (presentation !== undefined) {
          sections.push(...packageSections(project, {
            kind: "operator",
            item,
            symbol: context.application.operator,
            address: context.address,
          }, presentation.project(context),
            authoring?.hasOperatorParameterAuthoring(context.application.operator) === true
              && itemTracksWritable(project, view, [item.id])));
        }
      }
      if (item.kind === "present" && item.source === "component") {
        const presentation = components.get(nlePackageSymbolKey(item.component));
        if (presentation !== undefined) {
          sections.push(...packageSections(project, {
            kind: "component",
            item,
            symbol: item.component,
          }, presentation.project({ project, track, item }),
            authoring?.hasComponentParameterAuthoring(item.component) === true
              && itemTracksWritable(project, view, [item.id])));
        }
        for (const reference of item.sharedValues ?? []) {
          const resource = findNleComponentValue(project, reference.ref);
          const shared = componentValues.get(componentValueKey(resource.component, resource.slot));
          if (shared !== undefined) {
            sections.push(...sharedSections(project, view, resource, shared.project({
              project,
              value: resource,
              users: componentValueUsers(project, resource.id),
            }), authoring?.hasComponentValueAuthoring(resource.component, resource.slot) === true));
          }
        }
      }
      for (const observation of observations) {
        if (observation.item !== id) continue;
        for (const section of observation.sections) {
          assertSectionBody(section, `NLE Inspector observation section ${section.id}`);
          assert(!sections.some((candidate) => candidate.id === section.id),
            `NLE Inspector repeats section ${section.id}.`);
          sections.push(structuredClone(section));
        }
      }
      const sectionIds = new Set<string>();
      for (const section of sections) {
        assert(!sectionIds.has(section.id), `NLE Inspector repeats section ${section.id}.`);
        sectionIds.add(section.id);
      }
      return {
        format: "hypit.nle-inspector-scene@1",
        item: id,
        revision: project.revision,
        title: displayedTitle,
        sections,
      };
    },
    packageEdit(project, id, sectionId, fieldId, value) {
      const { track, item } = findNleItem(project, id);
      if (item.kind === "present" && item.source === "component") {
        const presentation = components.get(nlePackageSymbolKey(item.component));
        if (presentation !== undefined) {
          const drafts = presentation.project({ project, track, item });
          const section = drafts.find((candidate) => candidate.id === sectionId);
          if (section !== undefined) {
            assertDraft(section, `NLE Inspector section ${sectionId}`);
            assert(section.owner?.kind !== "binding", `NLE Inspector section ${sectionId} owns a shared value.`);
            const field = section.fields.find((candidate) => candidate.id === fieldId);
            if (field === undefined || field.edit === undefined) {
              throw new Error(`NLE Inspector field ${sectionId}.${fieldId} is read-only.`);
            }
            assert(authoring?.hasComponentParameterAuthoring(item.component) === true,
              `NLE Inspector component authoring for ${nlePackageSymbolKey(item.component)} is not installed.`);
            editableValue(field, value);
            return { kind: "component", operation: canonicalize(field.edit(value)) };
          }
        }
      }
      for (const context of operatorContexts(project, track, item)) {
        const presentation = operators.get(nlePackageSymbolKey(context.application.operator));
        if (presentation === undefined) continue;
        const drafts = presentation.project(context);
        const section = drafts.find((candidate) => operatorSectionId(context.address, candidate.id) === sectionId);
        if (section === undefined) continue;
        assertDraft(section, `NLE Inspector section ${sectionId}`);
        assert(section.owner?.kind !== "binding", `NLE Inspector section ${sectionId} owns a shared value.`);
        const field = section.fields.find((candidate) => candidate.id === fieldId);
        if (field === undefined || field.edit === undefined) {
          throw new Error(`NLE Inspector field ${sectionId}.${fieldId} is read-only.`);
        }
        assert(authoring?.hasOperatorParameterAuthoring(context.application.operator) === true,
          `NLE Inspector Operator authoring for ${nlePackageSymbolKey(context.application.operator)} is not installed.`);
        editableValue(field, value);
        return { kind: "operator", address: context.address, operation: canonicalize(field.edit(value)) };
      }
      if (item.kind === "present" && item.source === "component") {
        for (const reference of item.sharedValues ?? []) {
          const resource = findNleComponentValue(project, reference.ref);
          const presentation = componentValues.get(componentValueKey(resource.component, resource.slot));
          if (presentation === undefined) continue;
          const sharedDrafts = presentation.project({
            project,
            value: resource,
            users: componentValueUsers(project, resource.id),
          });
          const shared = sharedDrafts.find((candidate) => componentValueSectionId(resource.id, candidate.id) === sectionId);
          if (shared === undefined) continue;
          assertDraft(shared, `NLE Inspector section ${sectionId}`);
          const field = shared.fields.find((candidate) => candidate.id === fieldId);
          if (field === undefined || field.edit === undefined) {
            throw new Error(`NLE Inspector field ${sectionId}.${fieldId} is read-only.`);
          }
          assert(authoring?.hasComponentValueAuthoring(resource.component, resource.slot) === true,
            `NLE Inspector Component value authoring ${componentValueKey(resource.component, resource.slot)} is not installed.`);
          editableValue(field, value);
          return { kind: "component-value", value: resource.id, operation: canonicalize(field.edit(value)) };
        }
      }
      throw new Error(`NLE Inspector section ${sectionId} is unknown.`);
    },
  };
}
