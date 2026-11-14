import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNleTransaction,
  createNleAuthoringFacet,
  createNleAuthoringHost,
  createNleAuthoringHostFromFacets,
  createNleProject,
  findNleItem,
  nleLinearTimeMapping,
  nlePackagesFromFacets,
  type NleComponentParameterAuthoring,
  type NleComponentMediaAuthoring,
  type NleComponentValueAuthoring,
  type NleOperatorParameterAuthoring,
  type NleMatteParameterAuthoring,
  type NleTransitionParameterAuthoring,
} from "../src/index.js";

const effectSymbol = {
  module: { name: "@example/amount" },
  name: "amount",
} as const;
const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

const authoring: NleOperatorParameterAuthoring = {
  operator: effectSymbol,
  inspect: ({ application }) => application.parameters,
  edit: (operation) => {
    if (operation === null || typeof operation !== "object" || Array.isArray(operation)) {
      throw new Error("Example amount edit is invalid.");
    }
    const edit = operation as Readonly<Record<string, unknown>>;
    if (edit.kind !== "set-amount" || typeof edit.amount !== "number") {
      throw new Error("Example amount edit is invalid.");
    }
    return { amount: edit.amount };
  },
};

const componentAuthoring: NleComponentParameterAuthoring = {
  component: { module: { name: "@example/title" }, name: "title" },
  inspect: ({ item }) => item.parameters,
  edit: (operation) => operation,
};

const componentValueAuthoring: NleComponentValueAuthoring = {
  component: componentAuthoring.component,
  slot: "style",
  inspect: ({ value }) => value.value,
  edit: (operation) => operation,
};

const componentMediaAuthoring: NleComponentMediaAuthoring = {
  component: componentAuthoring.component,
  inputs: () => [{ key: "portrait:lead", label: "Lead portrait", requires: ["picture"], required: true }],
};

const transitionSymbol = {
  module: { name: "@example/transition" },
  name: "transition",
} as const;
const matteSymbol = {
  module: { name: "@example/matte" },
  name: "matte",
} as const;
const transitionAuthoring: NleTransitionParameterAuthoring = {
  transition: transitionSymbol,
  inspect: ({ transition }) => transition.parameters,
  edit: (operation) => operation,
};
const matteAuthoring: NleMatteParameterAuthoring = {
  matte: matteSymbol,
  inspect: ({ matte }) => matte.parameters,
  edit: (operation) => operation,
};

function project() {
  return applyNleTransaction(createNleProject({
    id: "authoring",
    name: "Authoring",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [{
      id: "title",
      kind: "present", source: "component",
      start: second(0),
      duration: second(1),
      sourceTime: nleLinearTimeMapping(second(1)),
      enabled: true,
      component: { module: { name: "@example/title" }, name: "title" },
      parameters: {},
      picture: {
        layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
        operators: [{
          id: "local-amount",
          operator: effectSymbol,
          parameters: { amount: 0.5 },
          controlTime: nleLinearTimeMapping(second(1)),
        }],
      },
    }, {
      id: "amount", kind: "adjustment", operator: effectSymbol, parameters: { amount: 1 },
      start: second(0), duration: second(1), controlTime: nleLinearTimeMapping(second(1)), enabled: true,
    }] },
  }] });
}

function adjustmentParameters(value: ReturnType<typeof project>) {
  const item = findNleItem(value, "amount").item;
  if (item.kind !== "adjustment") throw new Error("Authoring fixture Adjustment changed kind.");
  return item.parameters;
}

function relationItem(id: string, start: number, duration: number) {
  return {
    id,
    kind: "present" as const, source: "component" as const,
    start: second(start),
    duration: second(duration),
    sourceTime: nleLinearTimeMapping(second(duration)),
    enabled: true,
    component: { module: { name: "@example/title" }, name: "title" },
    parameters: {},
    picture: {
      layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" as const },
    },
  };
}

function transitionProject() {
  return applyNleTransaction(createNleProject({
    id: "transition-authoring",
    name: "Transition authoring",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "track.add", track: {
      id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [relationItem("left", 0, 2), relationItem("right", 1, 2)],
    } },
    { kind: "transition.add", transition: {
      id: "join", outgoing: "left", incoming: "right", operator: transitionSymbol,
      parameters: { amount: 0.5 },
    } },
  ] });
}

function matteProject() {
  return applyNleTransaction(createNleProject({
    id: "matte-authoring",
    name: "Matte authoring",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [
    { kind: "track.add", track: {
      id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [relationItem("content", 0, 2), relationItem("mask", 0, 2)],
    } },
    { kind: "matte.add", matte: {
      id: "key", content: "content", matte: "mask", operator: matteSymbol,
      parameters: { invert: false },
    } },
  ] });
}

test("package authoring plans an ordinary revisioned NLE transaction", () => {
  const facet = createNleAuthoringFacet({ operatorParameters: [authoring] });
  assert.equal(nlePackagesFromFacets([facet]).length, 0);
  const host = createNleAuthoringHostFromFacets([facet]);
  const original = project();

  assert.deepEqual(host.inspectOperatorParameters(original, { kind: "adjustment", item: "amount" }), { amount: 1 });
  const transaction = host.planOperatorParameterEdit(original, { kind: "adjustment", item: "amount" }, {
    kind: "set-amount", amount: 0.25,
  });
  assert.equal(transaction.revision, original.revision);
  assert.deepEqual(transaction.commands.map((command) => command.kind), ["item.replace"]);
  assert.deepEqual(adjustmentParameters(original), { amount: 1 });

  const edited = applyNleTransaction(original, transaction);
  assert.deepEqual(adjustmentParameters(edited), { amount: 0.25 });
});

test("one Operator authoring owner edits Adjustment and occurrence-local Applications", () => {
  const original = project();
  const host = createNleAuthoringHost([{ operatorParameters: [authoring] }]);
  const address = {
    kind: "occurrence" as const,
    item: "title",
    medium: "picture" as const,
    application: "local-amount",
  };
  assert.deepEqual(host.inspectOperatorParameters(original, address), { amount: 0.5 });
  const transaction = host.planOperatorParameterEdit(original, address, {
    kind: "set-amount", amount: 0.75,
  });
  assert.equal(transaction.commands[0]?.kind, "operator-application.replace");
  const edited = applyNleTransaction(original, transaction);
  assert.deepEqual(host.inspectOperatorParameters(edited, address), { amount: 0.75 });
});

test("authoring is optional and uniquely selected", () => {
  const original = project();
  const host = createNleAuthoringHost([{
    componentParameters: [componentAuthoring],
    operatorParameters: [authoring],
  }]);
  assert.equal(host.hasComponentParameterAuthoring(componentAuthoring.component), true);
  assert.equal(host.hasComponentValueAuthoring(componentAuthoring.component, "style"), false);
  assert.equal(host.hasOperatorParameterAuthoring(effectSymbol), true);
  assert.throws(() => createNleAuthoringHost([])
    .inspectOperatorParameters(original, { kind: "adjustment", item: "amount" }), /is not installed/u);
  assert.throws(() => createNleAuthoringHost([])
    .inspectComponentParameters(original, "title"), /is not installed/u);
  assert.throws(() => createNleAuthoringHost([
    { operatorParameters: [authoring] },
    { operatorParameters: [authoring] },
  ]), /multiple Operator parameter owners/u);
  assert.throws(() => createNleAuthoringHost([
    { componentParameters: [componentAuthoring] },
    { componentParameters: [componentAuthoring] },
  ]), /multiple Component parameter owners/u);
  assert.throws(() => createNleAuthoringHost([
    { componentValues: [componentValueAuthoring] },
    { componentValues: [componentValueAuthoring] },
  ]), /multiple Component value owners/u);
});

test("shared Component values are edited in place without rewriting their users", () => {
  const base = project();
  const title = findNleItem(base, "title").item;
  if (title.kind !== "present" || title.source !== "component") {
    throw new Error("Authoring fixture title changed kind.");
  }
  const original = applyNleTransaction(base, { revision: base.revision, commands: [{
    kind: "component-value.add",
    value: {
      id: "title-style",
      name: "Title style",
      component: componentAuthoring.component,
      slot: "style",
      value: { color: "#ffffff" },
    },
  }, {
    kind: "item.replace",
    item: {
      ...title,
      sharedValues: [{ slot: "style", ref: "title-style" }],
    },
  }] });
  const before = findNleItem(original, "title").item;
  const host = createNleAuthoringHost([{ componentValues: [componentValueAuthoring] }]);
  assert.deepEqual(host.inspectComponentValue(original, "title-style"), { color: "#ffffff" });
  const edited = applyNleTransaction(original,
    host.planComponentValueEdit(original, "title-style", { color: "#e3406a" }));
  assert.deepEqual(edited.componentValues[0]?.value, { color: "#e3406a" });
  assert.deepEqual(findNleItem(edited, "title").item, before);
});

test("Component packages declare Media roles while Core plans only direct asset replacement", () => {
  const original = project();
  const host = createNleAuthoringHost([{ componentMedia: [componentMediaAuthoring] }]);
  assert.equal(host.hasComponentMediaAuthoring(componentAuthoring.component), true);
  assert.deepEqual(host.inspectComponentMediaInputs(original, "title"), [{
    key: "portrait:lead", label: "Lead portrait", requires: ["picture"], required: true,
  }]);

  const selected = applyNleTransaction(original, host.planComponentMediaInputSet(
    original,
    "title",
    "portrait:lead",
    { path: "../media/lead.media.json" },
  ));
  assert.deepEqual(host.inspectComponentMediaInputs(selected, "title"), [{
    key: "portrait:lead", label: "Lead portrait", requires: ["picture"], required: true,
    asset: { path: "../media/lead.media.json" },
  }]);

  const removed = applyNleTransaction(selected,
    host.planComponentMediaInputRemove(selected, "title", "portrait:lead"));
  const item = findNleItem(removed, "title").item;
  assert.equal(item.kind === "present" && item.source === "component" ? item.media : undefined, undefined);
  assert.throws(() => host.planComponentMediaInputSet(original, "title", "unknown", {
    path: "../media/unknown.media.json",
  }), /does not declare Media input/u);
  assert.throws(() => createNleAuthoringHost([
    { componentMedia: [componentMediaAuthoring] },
    { componentMedia: [componentMediaAuthoring] },
  ]), /multiple Component Media input owners/u);
});

test("Transition and Matte packages own relation parameter editing without extending NLE domain model", () => {
  const host = createNleAuthoringHost([{
    transitionParameters: [transitionAuthoring],
    matteParameters: [matteAuthoring],
  }]);
  const transitionOriginal = transitionProject();
  assert.deepEqual(host.inspectTransitionParameters(transitionOriginal, "join"), { amount: 0.5 });
  const transitionEdited = applyNleTransaction(transitionOriginal,
    host.planTransitionParameterEdit(transitionOriginal, "join", { amount: 0.75 }));
  assert.deepEqual(transitionEdited.transitions[0]?.parameters, { amount: 0.75 });

  const matteOriginal = matteProject();
  assert.deepEqual(host.inspectMatteParameters(matteOriginal, "key"), { invert: false });
  const matteEdited = applyNleTransaction(matteOriginal,
    host.planMatteParameterEdit(matteOriginal, "key", { invert: true }));
  assert.deepEqual(matteEdited.mattes[0]?.parameters, { invert: true });

  assert.throws(() => createNleAuthoringHost([
    { transitionParameters: [transitionAuthoring] },
    { transitionParameters: [transitionAuthoring] },
  ]), /multiple Transition parameter owners/u);
  assert.throws(() => createNleAuthoringHost([
    { matteParameters: [matteAuthoring] },
    { matteParameters: [matteAuthoring] },
  ]), /multiple Matte parameter owners/u);
});
