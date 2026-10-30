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
        components: [{ id: "generated", fragment: identityFragment, inputs: {},
          outputs: { result: "generated.value" } }],
        exports: [{ name: "value", ref: { kind: "record", id: "value" }, type: identityType }],
        retainedOutputs: [{ name: "generated.value",
          ref: { kind: "component-output", component: "generated", output: "result" }, type: identityType }],
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
  assert.deepEqual(compiled.retainedOutputs.map((output) => output.name), [
    "child/generated.value",
    "generated.value",
  ]);
  assert.equal(compiled.retainedOutputs.every((output) => output.ref.kind === "logical-output"), true);
});

test("retained Output identity rejects one Source reached through multiple aliases", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover(unit) {
      return { modules: [], sources: unit.name === "main" ? [
        { from: "./child", alias: "first", range: { start: 0, end: 0 } },
        { from: "./child", alias: "second", range: { start: 0, end: 0 } },
      ] : [] };
    },
    decode(unit) {
      if (unit.name === "main") return { records: [], components: [], exports: [] };
      return {
        records: [],
        components: [{ id: "generated", fragment: identityFragment, inputs: {},
          outputs: { result: "generated.value" } }],
        exports: [],
        retainedOutputs: [{ name: "generated.value",
          ref: { kind: "component-output" as const, component: "generated", output: "result" }, type: identityType }],
      };
    },
  });
  await assert.rejects(compileSourceClosure({
    entry: source("/project/main", "main"),
    closure: createResolvedClosure([manifest]),
    frontends,
    resolveSource() { return source("/project/child", "child"); },
  }), (error: unknown) => error instanceof SourceClosureError
    && error.code === "AMBIGUOUS_RETAINED_OUTPUT_PATH"
    && /first, second/u.test(error.message));
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
