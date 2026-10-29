import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure } from "@hypit/kernel";
import {
  AuthorFrontendRegistry,
  sealGraphFragment,
} from "@hypit/author";
import { SourceClosureError, compileSourceClosure } from "@hypit/compiler";
import type { ResolvedSource } from "@hypit/source";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";

const moduleRef = { name: "example.identity", version: "1" } as const;
const identityType = { module: moduleRef, name: "PublicIdentity" } satisfies TypeRef;
const otherType = { module: moduleRef, name: "Other" } satisfies TypeRef;
const produceIdentity = { module: moduleRef, name: "produce" } satisfies ProducerRef;
const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [identityType.name, otherType.name],
  capabilities: [],
  producers: [{
    name: produceIdentity.name,
    inputs: [],
    result: { kind: "output", name: "result", type: identityType },
  }],
};
const frontendId = "example.identity-frontend@1";
const identityFragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "produce",
    producer: produceIdentity,
    inputs: {},
    result: { kind: "output", name: "result" },
  }],
  exports: [{
    name: "result",
    type: identityType,
    root: { kind: "fragment-operation", operation: "produce" },
  }],
});

function source(id: string, name: string): ResolvedSource {
  return resolveSelfDescribedTextSource({ id, name, text: `<?svml using="${frontendId}"?>\nidentity` });
}

test("Source Closure hygienizes author provenance across imported Sources", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover(unit) {
      return {
        modules: [],
        sources: unit.name === "main"
          ? [{ from: "./child", alias: "child", range: { start: 0, end: 0 } }]
          : [],
      };
    },
    decode(unit) {
      return {
        records: [{ id: "value", type: identityType, value: (unit.name) }],
        components: [],
        exports: [{ name: "value", ref: { kind: "record", id: "value" }, type: identityType }],
        provenance: [{
          range: { start: 1, end: 9 },
          records: ["value"],
          components: [],
          outputs: [],
          inputs: [{ name: "label", range: { start: 2, end: 7 }, kind: "literal" }],
        }],
      };
    },
  });
  const compiled = await compileSourceClosure({
    entry: source("/project/main", "main"),
    closure: createResolvedClosure([manifest]),
    frontends,
    resolveSource() { return source("/project/child", "child"); },
  });
  assert.equal(compiled.provenance.elements.length, 2);
  const bySource = new Map(compiled.provenance.elements.map((item) => [item.sourceName, item] as const));
  const mainRecord = bySource.get("main")?.records[0]?.id;
  const childRecord = bySource.get("child")?.records[0]?.id;
  assert.ok(mainRecord);
  assert.ok(childRecord);
  assert.notEqual(mainRecord, childRecord);
  assert.equal(compiled.program.records.some((record) => record.id === mainRecord), true);
  assert.equal(compiled.program.records.some((record) => record.id === childRecord), true);
  assert.notEqual(bySource.get("main")?.inputs[0]?.id, bySource.get("child")?.inputs[0]?.id);
});

test("Source Closure identity includes the explicit Frontend for shared Source bytes", async () => {
  const firstFrontendId = "example.first-frontend@1";
  const secondFrontendId = "example.second-frontend@1";
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover() {
      return { modules: [], sources: [
        { from: "./shared", alias: "first", range: { start: 0, end: 0 } },
        { from: "./shared", alias: "second", range: { start: 0, end: 0 } },
      ] };
    },
    decode() {
      return { records: [], components: [], exports: [] };
    },
  });
  for (const id of [firstFrontendId, secondFrontendId]) {
    frontends.register({
      id,
      discover() {
        return { modules: [], sources: [] };
      },
      decode() {
        return {
          records: [{ id: "value", type: identityType, value: id }],
          components: [],
          exports: [{ name: "value", ref: { kind: "record", id: "value" }, type: identityType }],
        };
      },
    });
  }
  const shared = source("source:shared", "shared").unit;
  const compiled = await compileSourceClosure({
    entry: source("source:main", "main"),
    closure: createResolvedClosure([manifest]),
    frontends,
    resolveSource(_importer, request) {
      return {
        unit: shared,
        frontend: request.alias === "first" ? firstFrontendId : secondFrontendId,
      };
    },
  });

  const sharedUnits = compiled.closure.units.filter((unit) => unit.name === "shared");
  assert.equal(sharedUnits.length, 2);
  assert.notEqual(sharedUnits[0]?.id, sharedUnits[1]?.id);
  assert.deepEqual(new Set(compiled.program.records.map((record) => record.id)).size, 2);
});

test("Source Closure resolves authored realizations to hygienic graph identities", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover() {
      return { modules: [], sources: [] };
    },
    decode() {
      return {
        records: [{ id: "accepted", type: identityType, value: "accepted" }],
        components: [{
          id: "generated",
          fragment: identityFragment,
          inputs: {},
          outputs: { result: "generated.result" },
        }],
        realizations: [{
          output: { kind: "component-output", component: "generated", output: "result" },
          record: { kind: "record", id: "accepted" },
        }],
        exports: [],
        provenance: [{
          range: { start: 0, end: 8 },
          records: ["accepted"],
          components: ["generated"],
          outputs: [{ component: "generated", name: "result", id: "generated.result" }],
          inputs: [],
          realizations: [{
            output: { kind: "component-output", component: "generated", output: "result" },
            record: { kind: "record", id: "accepted" },
          }],
        }],
      };
    },
  });
  const compiled = await compileSourceClosure({
    entry: source("/project/main", "main"),
    closure: createResolvedClosure([manifest]),
    frontends,
    resolveSource() {
      throw new Error("unused");
    },
  });

  assert.equal(compiled.realizations.length, 1);
  const selection = compiled.realizations[0]!;
  assert.notEqual(selection.output, "generated.result");
  assert.notEqual(selection.record, "accepted");
  assert.equal(compiled.graph.outputs.some((output) => output.id === selection.output), true);
  assert.equal(compiled.program.records.some((record) => record.id === selection.record), true);
  assert.deepEqual(compiled.provenance.elements[0]?.realizations, [{
    output: {
      kind: "component-output",
      component: compiled.provenance.elements[0]?.components[0]?.id,
      output: "result",
    },
    record: {
      kind: "record",
      id: compiled.provenance.elements[0]?.records[0]?.id,
    },
  }]);
});

test("Source Closure rejects a realization whose Record Type differs from its output", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover() {
      return { modules: [], sources: [] };
    },
    decode() {
      return {
        records: [{ id: "accepted", type: otherType, value: "wrong type" }],
        components: [{
          id: "generated",
          fragment: identityFragment,
          inputs: {},
          outputs: { result: "generated.result" },
        }],
        realizations: [{
          output: { kind: "component-output", component: "generated", output: "result" },
          record: { kind: "record", id: "accepted" },
        }],
        exports: [],
      };
    },
  });

  await assert.rejects(
    compileSourceClosure({
      entry: source("/project/main", "main"),
      closure: createResolvedClosure([manifest]),
      frontends,
      resolveSource() {
        throw new Error("unused");
      },
    }),
    (error: unknown) => error instanceof SourceClosureError
      && error.code === "REALIZATION_TYPE_MISMATCH",
  );
});
