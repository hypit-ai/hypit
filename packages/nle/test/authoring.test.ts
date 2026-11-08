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
  type NleEffectParameterAuthoring,
  type NleMatteParameterAuthoring,
  type NleTransitionParameterAuthoring,
} from "../src/index.js";

const effectSymbol = {
  module: { name: "@example/amount", version: "1" },
  name: "amount",
} as const;
const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });

const authoring: NleEffectParameterAuthoring = {
  effect: effectSymbol,
  inspect: ({ effect }) => effect.parameters,
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

function project(locked = false) {
  return applyNleTransaction(createNleProject({
    id: "authoring",
    name: "Authoring",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", locked, muted: false, items: [{
      id: "title",
      kind: "component",
      start: second(0),
      duration: second(1),
      sourceTime: nleLinearSourceTime(second(1)),
      enabled: true,
      component: { module: { name: "@example/title", version: "1" }, name: "title" },
      parameters: {},
      picture: {
        layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
        effects: [{ id: "amount", effect: effectSymbol, parameters: { amount: 1 } }],
      },
    }] },
  }] });
}

function effectParameters(value: ReturnType<typeof project>) {
  const item = findNleItem(value, "title").item;
  if (item.kind !== "component") throw new Error("Authoring fixture Item changed kind.");
  return item.picture?.effects[0]?.parameters;
}

function relationItem(id: string, start: number, duration: number) {
  return {
    id,
    kind: "component" as const,
    start: second(start),
    duration: second(duration),
    sourceTime: nleLinearSourceTime(second(duration)),
    enabled: true,
    component: { module: { name: "@example/title", version: "1" }, name: "title" },
    parameters: {},
    picture: {
      layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" as const },
      effects: [],
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
      id: "picture", name: "Picture", kind: "picture", locked: false, muted: false,
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
      id: "picture", name: "Picture", kind: "picture", locked: false, muted: false,
      items: [relationItem("content", 0, 2), relationItem("mask", 0, 2)],
    } },
    { kind: "matte.add", matte: {
      id: "key", content: "content", matte: "mask", operator: matteSymbol,
      parameters: { invert: false },
    } },
  ] });
}

test("package authoring plans an ordinary revisioned NLE transaction", () => {
  const facet = createNleAuthoringFacet({ effectParameters: [authoring] });
  assert.equal(nlePackagesFromFacets([facet]).length, 0);
  const host = createNleAuthoringHostFromFacets([facet]);
  const original = project();

  assert.deepEqual(host.inspectEffectParameters(original, "title", "amount"), { amount: 1 });
  const transaction = host.planEffectParameterEdit(original, "title", "amount", {
    kind: "set-amount", amount: 0.25,
  });
  assert.equal(transaction.revision, original.revision);
  assert.deepEqual(transaction.commands.map((command) => command.kind), ["item.replace"]);
  assert.deepEqual(effectParameters(original), { amount: 1 });

  const edited = applyNleTransaction(original, transaction);
  assert.deepEqual(effectParameters(edited), { amount: 0.25 });
});

test("authoring is optional, uniquely selected and cannot bypass Track locks", () => {
  const original = project(true);
  const host = createNleAuthoringHost([{
    componentParameters: [componentAuthoring],
    effectParameters: [authoring],
  }]);
  const transaction = host.planEffectParameterEdit(original, "title", "amount", {
    kind: "set-amount", amount: 0.5,
  });
  assert.throws(() => applyNleTransaction(original, transaction), /is locked/u);
  const componentTransaction = host.planComponentParameterEdit(original, "title", { title: "Changed" });
  assert.throws(() => applyNleTransaction(original, componentTransaction), /is locked/u);
  assert.throws(() => createNleAuthoringHost([])
    .inspectEffectParameters(original, "title", "amount"), /is not installed/u);
  assert.throws(() => createNleAuthoringHost([])
    .inspectComponentParameters(original, "title"), /is not installed/u);
  assert.throws(() => createNleAuthoringHost([
    { effectParameters: [authoring] },
    { effectParameters: [authoring] },
  ]), /multiple Effect parameter owners/u);
  assert.throws(() => createNleAuthoringHost([
    { componentParameters: [componentAuthoring] },
    { componentParameters: [componentAuthoring] },
  ]), /multiple Component parameter owners/u);
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
