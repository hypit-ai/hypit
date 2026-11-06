import assert from "node:assert/strict";
import test from "node:test";

import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import {
  NleSubjectProjectorRegistry,
  prepareNleSubjectProjection,
  projectPreparedNleSubject,
  createNleSubjectProjectorFacet,
  installNleSubjectProjectorFacets,
  nleProjectedActionInvocation,
  type NleSubjectProjector,
} from "../src/index.js";

const module = { name: "@example/component", version: "1" } as const;
const type = { module, name: "Schedule" } as const;
const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const domain = sealLocalTemporalDomain({ id: "example:time", duration: at(4) });

function projector(id: string): NleSubjectProjector {
  return {
    id, module, declaration: "Component",
    requirements: [{ id: "schedule", type, from: { kind: "output", name: "schedule" } }],
    project(context) {
      return { id, label: id, items: id === "visual" ? [{
        id: "phase", label: "Phase", regions: { domain, regions: [{
          start: { position: at(1), side: "after" }, end: { position: at(2), side: "before" },
        }] }, actions: [],
      }] : [] };
    },
  };
}

test("one declaration may opt into zero, one or several NLE projections without Track objects", () => {
  const registry = new NleSubjectProjectorRegistry();
  const visual = projector("visual"), audio = projector("audio-events");
  installNleSubjectProjectorFacets([
    createNleSubjectProjectorFacet(visual), createNleSubjectProjectorFacet(audio),
  ], registry);
  const projections = registry.project(module, "Component", {
    ownerId: "example", subject: { source: "/main.svml", node: "component" },
    inputs: {}, outputs: { schedule: { type, value: {} } },
  });
  assert.deepEqual(projections.map((projection) => [projection.id, projection.items.length]), [
    ["visual", 1], ["audio-events", 0],
  ]);
  assert.deepEqual(registry.resolve({ name: "@example/other", version: "1" }, "Component"), []);
  assert.throws(() => registry.project(module, "Component", {
    ownerId: "example", subject: { source: "/main.svml", node: "component" },
    inputs: {}, outputs: { schedule: { type: { module, name: "Wrong" }, value: {} } },
  }), /wrong Type/u);
});

test("a projected rectangle has no edit meaning until it delegates an explicit action", () => {
  const action = {
    id: "hide", label: "Hide",
    authority: { module, declaration: "Component", action: "hide-items",
      subject: { source: "/main.svml", node: "component" } },
    preset: { items: ["phase"] },
  } as const;
  assert.deepEqual(nleProjectedActionInvocation(action, { id: "hide-phase", items: ["wrong"] }), {
    authority: action.authority,
    input: { id: "hide-phase", items: ["phase"] },
  });
});

test("headless assembly joins an exact author edge before observing projector values", async () => {
  const { svmlStructureFrontend } = await import("../../svml/src/index.js");
  const source = {
    id: "/project/main.svml",
    name: "main.svml",
    bytes: new TextEncoder().encode(`module example from "@example/component@1"

example.Component "captions" { document: @document }
`),
  };
  const document = await svmlStructureFrontend.openStructure(source);
  const declaration = document.nodes.find((node) => node.kind === "declaration"
    && node.name === "Component" && node.label === "captions")!;
  const registry = new NleSubjectProjectorRegistry();
  registry.register(projector("visual"));
  const prepared = prepareNleSubjectProjection({
    location: { owner: { kind: "component-output", component: "caption", output: "source" } },
    documents: [document],
    provenance: { format: "hypit.author-provenance@1", elements: [{
      id: "caption-element", source: source.id, sourceName: source.name, range: declaration.range,
      records: [],
      outputs: [
        { component: "caption", name: "source", local: "captions", id: "captions" },
        { component: "caption", name: "schedule", local: "captions.schedule", id: "captions.schedule" },
      ],
      inputs: [{ id: "document-input", name: "document", ref: { kind: "record", id: "document" } }],
    }] },
    registry,
  });
  assert.equal(prepared.subject.source, source.id);
  assert.equal(prepared.subject.node, declaration.node);
  assert.deepEqual(prepared.requiredOutputs, ["captions.schedule"]);
  const projections = projectPreparedNleSubject(prepared, {
    outputs: [{ output: "captions.schedule", record: "schedule-record" }],
    records: [
      { id: "document", type, value: {} },
      { id: "schedule-record", type, value: {} },
    ],
  }, registry);
  assert.deepEqual(projections.map((projection) => projection.id), ["visual"]);
  assert.throws(() => projectPreparedNleSubject(prepared, { outputs: [], records: [] }, registry),
    /has not resolved logical output captions\.schedule/u);
});
