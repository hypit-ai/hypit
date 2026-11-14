import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNleTransaction,
  createNleAuthoringHost,
  createNleProject,
  nleLinearTimeMapping,
  type NleComponentItem,
} from "@hypit/nle";

import {
  applyNleTimelineViewTransaction,
  createNleInspectorPresentationFacet,
  createNleInspectorPresentationHost,
  createNleTimelineView,
  nleInspectorPresentationPackagesFromFacets,
} from "../src/index.js";

const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });
const component = { module: { name: "@example/title" }, name: "default" } as const;
const filter = { module: { name: "@example/filter" }, name: "default" } as const;

function project() {
  const item = (id: string, start: number): NleComponentItem => ({
    id, kind: "present", source: "component", component,
    sharedValues: [{ slot: "style", ref: "style-main" }],
    parameters: { text: id }, start: second(start), duration: second(2),
    sourceTime: nleLinearTimeMapping(second(2)), enabled: true,
    picture: {
      layout: { ref: "layout-main" },
      ...(id === "title-a" ? { operators: [{
        id: "local-filter",
        operator: filter,
        parameters: { amount: 0.4 },
        controlTime: nleLinearTimeMapping(second(2)),
      }] } : {}),
    },
  });
  return applyNleTransaction(createNleProject({
    id: "film", name: "Film", canvas: { width: 1920, height: 1080, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "component-value.add", value: {
      id: "style-main", name: "Main title", component, slot: "style", value: { color: "#ffffff" },
    } },
    { kind: "picture-layout.add", value: {
      id: "layout-main", name: "Full frame", layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "contain" },
    } },
    { kind: "track.add", track: {
      id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [item("title-a", 0), item("title-b", 2)],
    } },
  ] });
}

test("Inspector Scene keeps NLE occurrence, shared resources and package semantics separate", () => {
  const facet = createNleInspectorPresentationFacet({ components: [{
    component,
    project: ({ item }) => [{
      id: "title-content", label: "Title", domain: "how", page: { id: "content", label: "Content" }, fields: [
        { id: "text", label: "Text", control: "text", value: String(
          (item.parameters as Readonly<Record<string, unknown>>).text,
        ), edit: (value) => ({ kind: "set-text", text: value }) },
      ],
    }],
  }], componentValues: [{
    component,
    slot: "style",
    project: ({ value }) => [{
      id: "title-style", label: "Style", domain: "how", page: { id: "appearance", label: "Appearance" }, fields: [{
        id: "color", label: "Color", control: "color",
        value: String((value.value as Readonly<Record<string, unknown>>).color),
        edit: (color) => ({ kind: "set-color", color }),
      }],
    }],
  }] });
  const presentationPackages = nleInspectorPresentationPackagesFromFacets([facet]);
  const missingAuthoring = createNleInspectorPresentationHost(presentationPackages);
  const authoring = createNleAuthoringHost([{
    componentParameters: [{ component, inspect: ({ item }) => item.parameters, edit: (operation) => operation }],
    componentValues: [{ component, slot: "style", inspect: ({ value }) => value.value, edit: (operation) => operation }],
  }]);
  const host = createNleInspectorPresentationHost(presentationPackages, authoring);
  const document = project();
  const view = createNleTimelineView({ id: "main", name: "Main", project: { path: "film.nle.json" },
    tracks: ["picture"], editRate: { numerator: 24, denominator: 1 } });
  const scene = host.scene(document, view, "title-a");
  assert.equal(scene.format, "hypit.nle-inspector-scene@1");
  assert.equal(scene.sections.find((section) => section.id === "nle-occurrence")?.owner.kind, "nle");
  assert.deepEqual(scene.sections.find((section) => section.id === "nle-occurrence")?.page,
    { id: "clip", label: "片段" });
  assert.deepEqual(scene.sections.find((section) => section.id === "nle-occurrence")?.fields[0], {
    id: "name", label: "名称", control: "text", value: "default", editable: true,
  });
  assert.deepEqual(scene.sections.find((section) => section.id === "nle-picture-layout")?.owner, {
    kind: "picture-layout", ref: "layout-main", name: "Full frame", sharedBy: ["title-a", "title-b"],
  });
  const shared = scene.sections.find((section) => section.id === "component-value:style-main:title-style");
  assert.deepEqual(shared?.owner, {
    kind: "component-value", component, slot: "style", ref: "style-main", name: "Main title",
    sharedBy: ["title-a", "title-b"],
  });
  assert.equal(scene.sections.find((section) => section.id === "title-content")?.owner.kind, "package");
  assert.deepEqual(scene.sections.find((section) => section.id === "title-content")?.page,
    { id: "content", label: "Content" });
  assert.equal(scene.sections.find((section) => section.id === "title-content")?.fields[0]?.editable, true);
  assert.deepEqual(host.packageEdit(document, "title-a", "title-content", "text", "Changed"), {
    kind: "component", operation: { kind: "set-text", text: "Changed" },
  });
  assert.equal(shared?.fields[0]?.editable, true);
  assert.deepEqual(shared?.page, { id: "appearance", label: "Appearance" });
  assert.deepEqual(host.packageEdit(document, "title-a", "component-value:style-main:title-style", "color", "#000000"), {
    kind: "component-value", value: "style-main", operation: { kind: "set-color", color: "#000000" },
  });
  const readOnly = missingAuthoring.scene(document, view, "title-a");
  assert.equal(readOnly.sections.find((section) => section.id === "title-content")?.fields[0]?.editable, undefined);
  assert.equal(readOnly.sections.find((section) => section.id
    === "component-value:style-main:title-style")?.fields[0]?.editable, undefined);
  assert.throws(() => missingAuthoring.packageEdit(document, "title-a", "title-content", "text", "Changed"),
    /authoring.+not installed/u);

  const locked = applyNleTimelineViewTransaction(view, document, { revision: 0, commands: [
    { kind: "track-lock.set", track: "picture", locked: true },
  ] });
  assert.equal(host.scene(document, locked, "title-a").sections
    .find((section) => section.id === "nle-occurrence")?.fields[0]?.editable, undefined);
  assert.equal(host.scene(document, locked, "title-a").sections
    .find((section) => section.id === "component-value:style-main:title-style")?.fields[0]?.editable, undefined);
  assert.equal(host.scene(document, locked, "title-a").sections
    .find((section) => section.id === "nle-picture-layout")?.fields[0]?.editable, undefined);
});

test("Inspector projects and edits occurrence-local Operator Applications by stable address", () => {
  const facet = createNleInspectorPresentationFacet({ operators: [{
    operator: filter,
    project: ({ application }) => [{
      id: "filter-state", label: "Filter", domain: "how", fields: [{
        id: "amount", label: "Amount", control: "number",
        value: Number((application.parameters as Readonly<Record<string, unknown>>).amount),
        edit: (amount) => ({ kind: "set-amount", amount }),
      }],
    }],
  }] });
  const authoring = createNleAuthoringHost([{ operatorParameters: [{
    operator: filter,
    inspect: ({ application }) => application.parameters,
    edit: (operation) => {
      const value = operation as Readonly<Record<string, unknown>>;
      if (typeof value.amount !== "number") throw new Error("Amount is invalid.");
      return { amount: value.amount };
    },
  }] }]);
  const host = createNleInspectorPresentationHost(
    nleInspectorPresentationPackagesFromFacets([facet]), authoring,
  );
  const document = project();
  const view = createNleTimelineView({
    id: "main", name: "Main", project: { path: "film.nle.json" }, tracks: ["picture"],
  });
  const section = host.scene(document, view, "title-a").sections
    .find((candidate) => candidate.id === "operator:picture:local-filter:filter-state");
  assert.equal(section?.fields[0]?.value, 0.4);
  assert.equal(section?.fields[0]?.editable, true);
  assert.deepEqual(host.packageEdit(
    document, "title-a", "operator:picture:local-filter:filter-state", "amount", 0.7,
  ), {
    kind: "operator",
    address: { kind: "occurrence", item: "title-a", medium: "picture", application: "local-filter" },
    operation: { kind: "set-amount", amount: 0.7 },
  });
});

test("Inspector package boundary rejects duplicate owners and arbitrary controls", () => {
  const presentation = { component, project: () => [{
    id: "title", label: "Title", domain: "how" as const,
    fields: [{ id: "text", label: "Text", control: "text" as const, value: "Hello" }],
  }] };
  assert.throws(() => createNleInspectorPresentationHost([
    { components: [presentation] }, { components: [presentation] },
  ]), /multiple Component presentations/u);
  const shared = { component, slot: "style", project: () => [{
    id: "style", label: "Style", domain: "how" as const,
    fields: [{ id: "color", label: "Color", control: "color" as const, value: "#ffffff" }],
  }] };
  assert.throws(() => createNleInspectorPresentationHost([
    { componentValues: [shared] }, { componentValues: [shared] },
  ]), /multiple Component value presentations/u);
  const invalid = createNleInspectorPresentationHost([{ components: [{
    component,
    project: () => [{ id: "bad", label: "Bad", domain: "how", fields: [
      { id: "raw", label: "Raw", control: "json", value: "{}" },
    ] }] as never,
  }] }]);
  const document = project();
  const view = createNleTimelineView({ id: "main", name: "Main", project: { path: "film.nle.json" }, tracks: ["picture"] });
  assert.throws(() => invalid.scene(document, view, "title-a"), /control is invalid/u);
});
