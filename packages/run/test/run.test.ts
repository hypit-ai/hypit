import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  link,
  reduce,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
} from "@narratage/core";
import { sealGraphFragment } from "@narratage/elaborator";
import type { CompiledSourceClosure } from "@narratage/elaborator";
import type { CompiledGraph, ModuleManifest, ProducerRef, TypeRef } from "@narratage/protocol";
import {
  compileRunSource,
  createRunFragmentHostFacet,
  installRunFragmentHostFacets,
  resolveRunDocument,
  RunFragmentRegistry,
  RunFrontendRegistry,
  RunSourceError,
  verifyRunSourceClosure,
} from "@narratage/run";
import { parseRunDocument, runMarkupFrontend } from "@narratage/run-markup";

const moduleRef = { name: "example.run", version: "1" } as const;
const promptType = { module: moduleRef, name: "Prompt" } satisfies TypeRef;
const mediaType = { module: moduleRef, name: "Media" } satisfies TypeRef;
const defaultProducer = { module: moduleRef, name: "default" } satisfies ProducerRef;
const previewProducer = { module: moduleRef, name: "preview" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "svml.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    { name: promptType.name, schema: { kind: "string" } },
    { name: mediaType.name, schema: { kind: "string" } },
  ],
  capabilities: [],
  producers: [defaultProducer, previewProducer].map((producer) => ({
    name: producer.name,
    inputs: [{ name: "prompt", type: promptType }],
    outputs: [{ name: "media", type: mediaType }],
    needs: [],
    implementation: {
      digest: digestOf(`example.run/${producer.name}@1`),
    },
  })),
};

function fixture(): CompiledSourceClosure {
  const closure = createResolvedClosure([manifest]);
  const prompt = sealRecord({
    id: "prompt:root",
    type: promptType,
    value: { kind: "inline", value: "A deliberate preview." },
    origin: { kind: "authored" },
  });
  const program = link(closure, [prompt]);
  const graph = sealCompiledGraph({
    program: program.semanticDigest,
    outputs: ["left", "right"].map((id) => ({ id, type: mediaType, primary: "default:candidate" })),
    candidates: [{
      id: "default:candidate",
      type: mediaType,
      root: { kind: "operation", result: { kind: "operation-result", operation: "default:operation" } },
    }],
    operations: [{
      id: "default:operation",
      producer: defaultProducer,
      inputs: { prompt: { kind: "record", id: prompt.id } },
      result: { kind: "output", name: "media", record: "default:record" },
    }],
  });
  return {
    program,
    graph,
    exports: [
      { name: "prompt", type: promptType, ref: { kind: "record", id: prompt.id } },
      { name: "left", type: mediaType, ref: { kind: "logical-output", id: "left" } },
      { name: "right", type: mediaType, ref: { kind: "logical-output", id: "right" } },
    ],
  } as unknown as CompiledSourceClosure;
}

function previewFragment() {
  return sealGraphFragment({
    inputs: [{ name: "prompt", type: promptType }],
    operations: [{
      id: "preview",
      producer: previewProducer,
      inputs: { prompt: { kind: "fragment-input", name: "prompt" } },
      result: { kind: "output", name: "media" },
    }],
    exports: ["first", "second"].map((name) => ({
      name,
      type: mediaType,
      root: { kind: "fragment-operation" as const, operation: "preview" },
    })),
  });
}

function realize(compilation: CompiledSourceClosure, run: Awaited<ReturnType<typeof resolveRunDocument>>): CompiledGraph {
  const selected = new Map(run.graph.satisfactions.map((item) => [item.output, item.candidate]));
  return sealCompiledGraph({
    program: compilation.program.semanticDigest,
    outputs: compilation.graph.outputs.map((item) => ({
      ...item,
      primary: selected.get(item.id) ?? item.primary,
    })),
    candidates: [...compilation.graph.candidates, ...run.graph.candidates],
    operations: [...compilation.graph.operations, ...run.graph.operations],
  });
}

async function compileDocument(body: string) {
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  return await compileRunSource({
    id: "/project/build.svrun",
    name: "build.svrun",
    text: `<?svml using="@narratage/run-markup@1"?>\n${body}`,
  }, frontends);
}

test("Run compilation consumes decode output without repeating package discovery", async () => {
  const frontends = new RunFrontendRegistry();
  frontends.register({
    ...runMarkupFrontend,
    discover() {
      throw new Error("package discovery must not run during compilation");
    },
  });
  const compiled = await compileRunSource({
    id: "/project/build.svrun",
    name: "build.svrun",
    text: `<?svml using="@narratage/run-markup@1"?>\n<svrun version="1"><author source="./main.svml"/><target output="left"/></svrun>`,
  }, frontends);
  assert.equal(compiled.document.targets[0]?.output, "left");
});

test("Run Fragments enter the Host only through the locked Run facet ABI", () => {
  const fragment = previewFragment();
  const facet = createRunFragmentHostFacet({ name: "@example/run-preview", fragments: { shared: fragment } });
  const registry = new RunFragmentRegistry();
  installRunFragmentHostFacets([facet], registry);
  assert.equal(registry.resolve("@example/run-preview", "shared")?.id, fragment.id);
});

test("one multi-export Fragment declaration remains one execution", async () => {
  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/>
    <import from="@example/run-preview" as="preview"/>
    <target output="left"/><target output="right"/>
    <fragment id="one-call" using="preview:shared"><input name="prompt" from="prompt"/></fragment>
    <satisfy output="left" candidate="one-call.first"/>
    <satisfy output="right" candidate="one-call.second"/>
  </svrun>`);
  const compilation = fixture();
  const fragments = new RunFragmentRegistry();
  fragments.register({ name: "@example/run-preview", fragments: { shared: previewFragment() } });
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    sourceClosure: compiled.closure,
    fragments,
    readStoredValue() { throw new Error("not used"); },
    readFile() { throw new Error("not used"); },
    readBuild() { throw new Error("not used"); },
  });
  const graph = realize(compilation, run);
  const state = start(compilation.program, graph, sealBuildRequest({ graph: graph.id, targets: run.graph.targets }));
  assert.equal(state.plan.steps.filter((item) => item.producer.name === "preview").length, 1);
});

test("a Provided Value is an ordinary zero-input Candidate", async () => {
  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/>
    <target output="left"/>
    <value id="fixed" type="example.run@1#Media" from="./fixed.json"/>
    <satisfy output="left" candidate="fixed"/>
  </svrun>`);
  const compilation = fixture();
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    sourceClosure: compiled.closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { return { kind: "inline", value: "already rendered" }; },
    readFile() { throw new Error("not used"); },
    readBuild() { throw new Error("not used"); },
  });
  const graph = realize(compilation, run);
  const state = start(compilation.program, graph, sealBuildRequest({ graph: graph.id, targets: run.graph.targets }));
  assert.equal(state.plan.steps.length, 0);
  assert.equal(state.records.filter((record) => record.origin.kind === "provided").length, 1);
});

test("a source file is an ordinary BlobArtifact Candidate", async () => {
  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/>
    <target output="left"/>
    <file id="approved" type="@narratage/artifact@1#BlobArtifact" from="./approved.mp4" media-type="video/mp4"/>
    <satisfy output="left" candidate="approved"/>
  </svrun>`);
  const compilation = fixture();
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    sourceClosure: compiled.closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readFile(from, mediaType) {
      assert.equal(from, "./approved.mp4");
      assert.equal(mediaType, "video/mp4");
      return { kind: "blob", digest: digestOf("approved video"), size: 14, mediaType };
    },
    readBuild() { throw new Error("not used"); },
  });
  assert.equal(run.graph.candidates.length, 1);
  assert.equal(run.graph.candidates[0]?.type.module.name, "@narratage/artifact");
  assert.equal(run.graph.candidates[0]?.type.name, "BlobArtifact");
});

test("a Build Record resolves a Host Catalog alias without entering Core", async () => {
  const compilation = fixture();
  let historical = start(compilation.program, compilation.graph, sealBuildRequest({
    graph: compilation.graph.id,
    targets: [{ output: "left" }],
  }));
  historical = reduce(historical);
  const command = historical.outstanding.find((item) => item.kind === "invoke-producer");
  assert.ok(command);
  const event = {
    kind: "producer-completed" as const,
    command: command.id,
    outputs: { media: { kind: "inline" as const, value: "archived media" } },
    needs: {},
  };
  historical = reduce(historical, { ...event, id: `event:${digestOf(event)}` });

  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/><target output="right"/>
    <build-record id="prior" build="prior-build" output="friendly-shot"/>
    <satisfy output="right" candidate="prior"/>
  </svrun>`);
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    sourceClosure: compiled.closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readFile() { throw new Error("not used"); },
    readBuild() { return historical; },
    resolveBuildOutput(_build, output) { assert.equal(output, "friendly-shot"); return "left"; },
  });
  const graph = realize(compilation, run);
  const state = start(compilation.program, graph, sealBuildRequest({ graph: graph.id, targets: run.graph.targets }));
  assert.equal(state.plan.steps.length, 0);
});

test("Run imports are a prologue and Runtime settings are not language elements", () => {
  assert.throws(() => parseRunDocument("bad.svrun", `<svrun version="1">
    <author source="./main.svml"/><target output="film"/><import from="@example/run" as="run"/>
  </svrun>`), /bad\.svrun:2:\d+:.*opening prologue/u);
  assert.throws(() => parseRunDocument("bad.svrun", `<svrun version="1">
    <author source="./main.svml"/><target output="film"/><provider name="kie"/>
  </svrun>`), /does not accept <provider>/u);
});

test("a Target-only source still compiles one mandatory Run Graph", async () => {
  const compiled = await compileDocument(`<svrun version="1"><author source="./main.svml"/><target output="left"/></svrun>`);
  const compilation = fixture();
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    sourceClosure: compiled.closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readFile() { throw new Error("not used"); },
    readBuild() { throw new Error("not used"); },
  });
  assert.equal(run.graph.operations.length, 0);
  assert.equal(run.graph.targets[0]?.output, "left");
});

test("Run Source Closure separates source bytes from semantic meaning", async () => {
  const first = await compileDocument(`<svrun version="1"><author source="./main.svml"/><target output="left"/></svrun>`);
  const second = await compileDocument(`<svrun version="1"><author source="./main.svml"/>\n\n<target output="left"/></svrun>`);
  assert.notEqual(first.closure.id, second.closure.id);
  assert.equal(first.closure.semanticDigest, second.closure.semanticDigest);
  assert.throws(() => verifyRunSourceClosure({
    ...first.closure,
    sourceDigest: digestOf("tampered"),
  }), (error: unknown) => error instanceof RunSourceError && error.code === "RUN_SOURCE_CLOSURE_DIGEST_MISMATCH");
});
