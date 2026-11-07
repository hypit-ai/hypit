import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure } from "@hypit/kernel";
import {
  AuthorFrontendRegistry,
  sealGraphFragment,
} from "@hypit/author";
import { SourceClosureError, compileSourceClosure, defaultSourceCompilationLimits } from "@hypit/compiler";
import type { SourceCompilationLimits } from "@hypit/compiler";
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

function limits(overrides: Partial<SourceCompilationLimits>): SourceCompilationLimits {
  return { ...defaultSourceCompilationLimits, ...overrides };
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
        publications: [{ name: "generated.value",
          ref: { kind: "component-output", component: "generated", output: "result" }, type: identityType,
          publication: { publisher: "example.identity-product@1" } }],
        provenance: [{
          range: { start: 1, end: 9 },
          records: ["value"],
          outputs: [],
          inputs: [{ name: "label" }],
        }],
      };
    },
  });
  const compiled = await compileSourceClosure({
    authorProjection: true,
    entry: source("/project/main", "main"),
    closure: createResolvedClosure([manifest]),
    frontends,
    resolveSource() { return source("/project/child", "child"); },
  });
  assert.equal(compiled.provenance.elements.length, 2);
  const bySource = new Map(compiled.provenance.elements.map((item) => [item.sourceName, item] as const));
  assert.equal(bySource.get("main")?.source, "/project/main");
  assert.equal(bySource.get("child")?.source, "/project/child");
  const mainRecord = bySource.get("main")?.records[0]?.id;
  const childRecord = bySource.get("child")?.records[0]?.id;
  assert.ok(mainRecord);
  assert.ok(childRecord);
  assert.notEqual(mainRecord, childRecord);
  assert.equal(compiled.program.records.some((record) => record.id === mainRecord), true);
  assert.equal(compiled.program.records.some((record) => record.id === childRecord), true);
  assert.notEqual(bySource.get("main")?.inputs[0]?.id, bySource.get("child")?.inputs[0]?.id);
  assert.deepEqual(compiled.publications.map((output) => output.name), [
    "child/generated.value",
    "generated.value",
  ]);
  assert.equal(compiled.publications.every((output) => output.ref.kind === "logical-output"), true);
});

test("published Output identity rejects one Source reached through multiple aliases", async () => {
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
        publications: [{ name: "generated.value",
          ref: { kind: "component-output" as const, component: "generated", output: "result" }, type: identityType,
          publication: { publisher: "example.identity-product@1" } }],
      };
    },
  });
  await assert.rejects(compileSourceClosure({
    entry: source("/project/main", "main"),
    closure: createResolvedClosure([manifest]),
    frontends,
    resolveSource() { return source("/project/child", "child"); },
  }), (error: unknown) => error instanceof SourceClosureError
    && error.code === "AMBIGUOUS_PUBLICATION_PATH"
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

test("Source closure accepts Host limits without copying them into compiled facts", async () => {
  const frontends = new AuthorFrontendRegistry();
  frontends.register({
    id: frontendId,
    discover(unit) {
      return { modules: [], sources: unit.name === "main"
        ? [{ from: "./child", alias: "child", range: { start: 0, end: 0 } }]
        : unit.name === "child"
          ? [{ from: "./grandchild", alias: "grandchild", range: { start: 0, end: 0 } }]
          : [] };
    },
    decode() { return { records: [], components: [], exports: [] }; },
  });
  const resolveSource = (_importer: unknown, request: { readonly alias: string }) =>
    request.alias === "child" ? source("/project/child", "child") : source("/project/grandchild", "grandchild");
  const base = { entry: source("/project/main", "main"), closure: createResolvedClosure([manifest]),
    frontends, resolveSource };
  await assert.rejects(compileSourceClosure({ ...base, limits: limits({ maxSources: 2 }) }),
    (error: unknown) => error instanceof SourceClosureError && error.code === "SOURCE_COUNT_LIMIT");
  await assert.rejects(compileSourceClosure({ ...base, limits: limits({ maxImportDepth: 2 }) }),
    (error: unknown) => error instanceof SourceClosureError && error.code === "SOURCE_IMPORT_DEPTH_LIMIT");
  await assert.rejects(compileSourceClosure({ ...base, limits: limits({ maxImportEdges: 1 }) }),
    (error: unknown) => error instanceof SourceClosureError && error.code === "SOURCE_IMPORT_EDGE_LIMIT");
  const compiled = await compileSourceClosure({ ...base, limits: limits({ maxSources: 3, maxImportDepth: 3 }) });
  assert.equal(compiled.closure.units.length, 3);
  assert.equal("limits" in compiled, false);
});

test("Source closure bounds declarations and readable author bytes at their acceptance points", async () => {
  const declarationFrontends = new AuthorFrontendRegistry();
  declarationFrontends.register({
    id: frontendId,
    discover() { return { modules: [], sources: [] }; },
    decode() {
      return {
        records: [
          { id: "first", type: identityType, value: "first" },
          { id: "second", type: identityType, value: "second" },
        ],
        components: [
          { id: "first-component", fragment: identityFragment, inputs: {}, outputs: { result: "first.result" } },
          { id: "second-component", fragment: identityFragment, inputs: {}, outputs: { result: "second.result" } },
        ], exports: [],
      };
    },
  });
  await assert.rejects(compileSourceClosure({
    entry: source("/project/main", "main"), closure: createResolvedClosure([manifest]),
    frontends: declarationFrontends, resolveSource() { throw new Error("no imports"); },
    limits: limits({ maxRecords: 1 }),
  }), (error: unknown) => error instanceof SourceClosureError && error.code === "SOURCE_RECORD_COUNT_LIMIT");
  await assert.rejects(compileSourceClosure({
    entry: source("/project/main", "main"), closure: createResolvedClosure([manifest]),
    frontends: declarationFrontends, resolveSource() { throw new Error("no imports"); },
    limits: limits({ maxRecords: 2, maxComponents: 1 }),
  }), (error: unknown) => error instanceof SourceClosureError && error.code === "SOURCE_COMPONENT_COUNT_LIMIT");

  const assetFrontends = new AuthorFrontendRegistry();
  assetFrontends.register({
    id: frontendId,
    discover() { return { modules: [], sources: [] }; },
    async decode(_unit, context) {
      if (context.readAsset === undefined) throw new Error("readAsset unavailable");
      await context.readAsset({ from: "./script.txt", mediaType: "text/plain" });
      return { records: [], components: [], exports: [] };
    },
  });
  await assert.rejects(compileSourceClosure({
    entry: source("/project/main", "main"), closure: createResolvedClosure([manifest]),
    frontends: assetFrontends, resolveSource() { throw new Error("no imports"); },
    readAsset() { return new Uint8Array(5); },
    limits: limits({ maxReadableAssetBytes: 4 }),
  }), (error: unknown) => error instanceof SourceClosureError
    && error.code === "SOURCE_READABLE_ASSET_BYTES_LIMIT");
});
