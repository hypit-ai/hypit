import assert from "node:assert/strict";
import test from "node:test";

import {
  createNleLoweringHost,
  createNleLoweringHostFromFacets,
  createNlePackageFacet,
  createNleProject,
  nlePackagesFromFacets,
  type NleComponentItem,
  type NleResolvedItemSource,
  type NleTrack,
} from "../src/index.js";

const symbol = { module: { name: "@example/title", version: "1" }, name: "card" } as const;
const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });
const item: NleComponentItem = {
  id: "title", kind: "component", component: symbol, parameters: {},
  start: second(0), duration: second(1), localStart: second(0), enabled: true,
  picture: { layout: { x: 0, y: 0, width: 10, height: 10, fit: "fill" }, effects: [] },
};
const project = createNleProject({
  id: "host", name: "Host", canvas: { width: 10, height: 10, clearColor: "black" },
});
const track: NleTrack = {
  id: "main", name: "Main", kind: "picture", locked: false, muted: false, items: [],
};

test("selected package facets dispatch exact NLE symbols without serialized registry state", () => {
  const resolved = { source: { id: "resolved", outputs: {} } } as unknown as NleResolvedItemSource;
  const facet = createNlePackageFacet({ components: [{ component: symbol, resolve: () => resolved }] });
  assert.equal(nlePackagesFromFacets([facet]).length, 1);
  const host = createNleLoweringHostFromFacets([facet]);
  assert.equal(host.resolveComponent(item, { project, track }), resolved);

  const missing = createNleLoweringHost([]);
  assert.throws(() => missing.resolveComponent(item, { project, track }), /is not installed/u);
  assert.throws(() => createNleLoweringHost([
    { components: [{ component: symbol, resolve: () => resolved }] },
    { components: [{ component: symbol, resolve: () => resolved }] },
  ]), /multiple resolvers/u);
});
