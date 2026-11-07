import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNleTransaction,
  createNleAuthoringFacet,
  createNleAuthoringHost,
  createNleAuthoringHostFromFacets,
  createNleProject,
  findNleItem,
  nlePackagesFromFacets,
  type NleComponentParameterAuthoring,
  type NleEffectParameterAuthoring,
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
      localStart: second(0),
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
