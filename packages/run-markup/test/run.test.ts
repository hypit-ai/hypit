import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import {
  createResolvedClosure,
  link,
  reduce,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
} from "@hypit/core";
import { sealGraphFragment } from "@hypit/elaborator";
import type { CompiledSourceClosure } from "@hypit/elaborator";
import type { CompiledGraph, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import {
  compileRunSource,
  createRunFragmentHostFacet,
  installRunFragmentHostFacets,
  resolveRunDocument,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@hypit/run";
import { parseRunDocument, runMarkupFrontend } from "@hypit/run-markup";

const moduleRef = { name: "example.run", version: "1" } as const;
const promptType = { module: moduleRef, name: "Prompt" } satisfies TypeRef;
const mediaType = { module: moduleRef, name: "Media" } satisfies TypeRef;
const defaultProducer = { module: moduleRef, name: "default" } satisfies ProducerRef;
const previewProducer = { module: moduleRef, name: "preview" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    { name: promptType.name },
    { name: mediaType.name },
  ],
  capabilities: [],
  producers: [defaultProducer, previewProducer].map((producer) => ({
    name: producer.name,
    inputs: [{ name: "prompt", type: promptType }],
    outputs: [{ name: "media", type: mediaType }],
    needs: [],
  })),
};

function fixture(): CompiledSourceClosure {
  const closure = createResolvedClosure([manifest]);
  const prompt = sealRecord({
    id: "prompt:root",
    type: promptType,
    value: { kind: "inline", value: "A deliberate preview." },
  });
  const program = link(closure, [prompt]);
  const graph = sealCompiledGraph({
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
    text: `<?svml using="@hypit/run-markup@1"?>\n${body}`,
  }, frontends);
}

test("Run Markup compilation consumes decode output without repeating package discovery", async () => {
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
    text: `<?svml using="@hypit/run-markup@1"?>\n<svrun version="1"><author source="./main.svml"/><target output="left"/></svrun>`,
  }, frontends);
  assert.equal(compiled.document.targets[0]?.output, "left");
});

test("Run Fragments enter the Host only through the selected Run facet ABI", () => {
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
    fragments,
    readStoredValue() { throw new Error("not used"); },
    readFile() { throw new Error("not used"); },
    resolveBuildRecord() { throw new Error("not used"); },
  });
  const graph = realize(compilation, run);
  const state = start(compilation.program, graph, sealBuildRequest({ targets: run.graph.targets }));
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
    fragments: new RunFragmentRegistry(),
    readStoredValue() { return { kind: "inline", value: "already rendered" }; },
    readFile() { throw new Error("not used"); },
    resolveBuildRecord() { throw new Error("not used"); },
  });
  const graph = realize(compilation, run);
  const state = start(compilation.program, graph, sealBuildRequest({ targets: run.graph.targets }));
  assert.equal(state.plan.steps.length, 0);
  assert.equal(state.records.some((record) => record.id === "provided:fixed"), true);
});

test("a source file is an ordinary BlobArtifact Candidate", async () => {
  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/>
    <target output="left"/>
    <file id="approved" type="@hypit/artifact@1#BlobArtifact" from="./approved.mp4" media-type="video/mp4"/>
    <satisfy output="left" candidate="approved"/>
  </svrun>`);
  const compilation = fixture();
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readFile(from, mediaType) {
      assert.equal(from, "./approved.mp4");
      assert.equal(mediaType, "video/mp4");
      return { kind: "blob", digest: fixtureDigest("approved video"), size: 14, mediaType };
    },
    resolveBuildRecord() { throw new Error("not used"); },
  });
  assert.equal(run.graph.candidates.length, 1);
  assert.equal(run.graph.candidates[0]?.type.module.name, "@hypit/artifact");
  assert.equal(run.graph.candidates[0]?.type.name, "BlobArtifact");
});

test("a Build Record resolves a Host Catalog alias without entering Core", async () => {
  const compilation = fixture();
  let historical = start(compilation.program, compilation.graph, sealBuildRequest({
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
  historical = reduce(historical, event);

  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/><target output="right"/>
    <build-record id="prior" build="prior-build" output="friendly-shot"/>
    <satisfy output="right" candidate="prior"/>
  </svrun>`);
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readFile() { throw new Error("not used"); },
    resolveBuildRecord(build, output) {
      assert.equal(build, "prior-build");
      assert.equal(output, "friendly-shot");
      const selection = historical.plan.selections.find((item) => item.output === "left");
      const record = historical.records.find((item) => item.id === selection?.record);
      assert.ok(record);
      return { type: record.type, value: record.value };
    },
  });
  const graph = realize(compilation, run);
  const state = start(compilation.program, graph, sealBuildRequest({ targets: run.graph.targets }));
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

test("duplicate satisfactions fail at the author-written Run edge", () => {
  assert.throws(() => parseRunDocument("bad.svrun", `<svrun version="1">
    <author source="./main.svml"/><target output="left"/>
    <value id="one" type="example.run@1#Media" from="./one.json"/>
    <value id="two" type="example.run@1#Media" from="./two.json"/>
    <satisfy output="left" candidate="one"/>
    <satisfy output="left" candidate="two"/>
  </svrun>`), /bad\.svrun:6:\d+:.*repeats output left/u);
});

test("a Target-only source still compiles one mandatory Run Graph", async () => {
  const compiled = await compileDocument(`<svrun version="1"><author source="./main.svml"/><target output="left"/></svrun>`);
  const compilation = fixture();
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readFile() { throw new Error("not used"); },
    resolveBuildRecord() { throw new Error("not used"); },
  });
  assert.equal(run.graph.operations.length, 0);
  assert.equal(run.graph.targets[0]?.output, "left");
});
