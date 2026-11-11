import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNleTransaction,
  createNleAuthoringFacet,
  createNleAuthoringHost,
  createNleAuthoringHostFromFacets,
  createNleProject,
  findNleItem,
  nleLinearSourceTime,
  nlePackagesFromFacets,
  type NleComponentParameterAuthoring,
  type NleComponentValueAuthoring,
  type NleAdjustmentParameterAuthoring,
  type NleMatteParameterAuthoring,
  type NleTransitionParameterAuthoring,
} from "../src/index.js";

const effectSymbol = {
  module: { name: "@example/amount", version: "1" },
  name: "amount",
} as const;
const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

const authoring: NleAdjustmentParameterAuthoring = {
  component: effectSymbol,
  inspect: ({ item }) => item.parameters,
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
  component: { module: { name: "@example/title", version: "1" }, name: "title" },
  inspect: ({ item }) => item.parameters,
  edit: (operation) => operation,
};

const componentValueAuthoring: NleComponentValueAuthoring = {
  component: componentAuthoring.component,
  slot: "style",
  inspect: ({ value }) => value.value,
  edit: (operation) => operation,
};

const transitionSymbol = {
  module: { name: "@example/transition", version: "1" },
  name: "transition",
} as const;
const matteSymbol = {
  module: { name: "@example/matte", version: "1" },
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
      sourceTime: nleLinearSourceTime(second(1)),
      enabled: true,
      component: { module: { name: "@example/title", version: "1" }, name: "title" },
      parameters: {},
      picture: { layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" } },
    }, {
      id: "amount", kind: "adjustment", component: effectSymbol, parameters: { amount: 1 },
      start: second(0), duration: second(1), sourceTime: nleLinearSourceTime(second(1)), enabled: true,
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
    sourceTime: nleLinearSourceTime(second(duration)),
    enabled: true,
    component: { module: { name: "@example/title", version: "1" }, name: "title" },
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
  const facet = createNleAuthoringFacet({ adjustmentParameters: [authoring] });
  assert.equal(nlePackagesFromFacets([facet]).length, 0);
  const host = createNleAuthoringHostFromFacets([facet]);
  const original = project();

  assert.deepEqual(host.inspectAdjustmentParameters(original, "amount"), { amount: 1 });
  const transaction = host.planAdjustmentParameterEdit(original, "amount", {
    kind: "set-amount", amount: 0.25,
  });
  assert.equal(transaction.revision, original.revision);
  assert.deepEqual(transaction.commands.map((command) => command.kind), ["item.replace"]);
  assert.deepEqual(adjustmentParameters(original), { amount: 1 });

  const edited = applyNleTransaction(original, transaction);
  assert.deepEqual(adjustmentParameters(edited), { amount: 0.25 });
});

test("authoring is optional and uniquely selected", () => {
  const original = project();
  const host = createNleAuthoringHost([{
    componentParameters: [componentAuthoring],
    adjustmentParameters: [authoring],
  }]);
  assert.equal(host.hasComponentParameterAuthoring(componentAuthoring.component), true);
  assert.equal(host.hasComponentValueAuthoring(componentAuthoring.component, "style"), false);
  assert.equal(host.hasAdjustmentParameterAuthoring(effectSymbol), true);
  assert.throws(() => createNleAuthoringHost([])
    .inspectAdjustmentParameters(original, "amount"), /is not installed/u);
  assert.throws(() => createNleAuthoringHost([])
    .inspectComponentParameters(original, "title"), /is not installed/u);
  assert.throws(() => createNleAuthoringHost([
    { adjustmentParameters: [authoring] },
    { adjustmentParameters: [authoring] },
  ]), /multiple Adjustment parameter owners/u);
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
      bindings: [{ slot: "style", ref: "title-style" }],
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

test("Transition and Matte packages own relation parameter editing without extending NLE Core", () => {
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
