import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealCompiledGraph,
  sealRecord,
} from "@hypit/core";
import { sealGraphFragment } from "@hypit/elaborator";
import type { CompiledSourceClosure } from "@hypit/elaborator";
import type { BuildState, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
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

function realize(compilation: CompiledSourceClosure, run: Awaited<ReturnType<typeof resolveRunDocument>>): BuildState {
  const planned = planBuild(compilation.program, compilation.graph, run.graph);
  return materializeBuild(defineBuild({
    program: compilation.program,
    initialRecords: planned.initialRecords,
    plan: planned.plan,
    targets: run.graph.targets,
  }), []);
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
  });
  const state = realize(compilation, run);
  assert.equal(state.plan.steps.filter((item) => item.producer.name === "preview").length, 1);
});

test("a Run Fragment may own an ordinary literal input", async () => {
  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/>
    <import from="@example/run-preview" as="preview"/>
    <target output="left"/>
    <fragment id="card" using="preview:shared"><input name="prompt" value="five seconds"/></fragment>
    <fragment id="unused" using="preview:shared"><input name="prompt" value="not selected"/></fragment>
    <satisfy output="left" candidate="card.first"/>
  </svrun>`);
  const compilation = fixture();
  const fragments = new RunFragmentRegistry();
  fragments.register({ name: "@example/run-preview", fragments: { shared: previewFragment() } });
  const run = await resolveRunDocument(compiled.document, { compilation, fragments });
  assert.deepEqual(run.graph.records, [
    {
      id: "record:run:card:prompt",
      type: promptType,
      value: { kind: "inline", value: "five seconds" },
    },
    {
      id: "record:run:unused:prompt",
      type: promptType,
      value: { kind: "inline", value: "not selected" },
    },
  ]);
  const state = realize(compilation, run);
  assert.equal(state.records.find((item) => item.id === "record:run:card:prompt")?.value.kind, "inline");
  assert.equal(state.records.some((item) => item.id === "record:run:unused:prompt"), false);
});

test("Run literal syntax decodes numbers and requires one source of value", () => {
  const parsed = parseRunDocument("duration.svrun", `<svrun version="1">
    <author source="./main.svml"/>
    <import from="@example/run-preview" as="preview"/>
    <target output="left"/>
    <fragment id="card" using="preview:shared"><input name="prompt" value="5"/></fragment>
    <satisfy output="left" candidate="card.first"/>
  </svrun>`);
  const input = parsed.candidates.find((item) => item.kind === "fragment")?.inputs[0];
  assert.deepEqual(input, { name: "prompt", value: 5 });
  assert.throws(() => parseRunDocument("bad.svrun", `<svrun version="1">
    <author source="./main.svml"/>
    <import from="@example/run-preview" as="preview"/>
    <target output="left"/>
    <fragment id="card" using="preview:shared"><input name="prompt" from="prompt" value="5"/></fragment>
  </svrun>`), /requires exactly one of from or value/u);
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
  });
  const state = realize(compilation, run);
  assert.equal(state.plan.steps.length, 0);
  assert.equal(state.records.some((record) => record.id === "provided:run:fixed"), true);
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
  });
  assert.equal(run.graph.candidates.length, 1);
  assert.equal(run.graph.candidates[0]?.type.module.name, "@hypit/artifact");
  assert.equal(run.graph.candidates[0]?.type.name, "BlobArtifact");
  assert.deepEqual(run.candidateSources[run.graph.candidates[0]!.id], {
    kind: "file",
    from: "./approved.mp4",
    mediaType: "video/mp4",
  });
});

test("a Build Record stays a structural zero-input Candidate until planning selects it", async () => {
  const compilation = fixture();
  const compiled = await compileDocument(`<svrun version="1">
    <author source="./main.svml"/><target output="right"/>
    <build-record id="prior" build="prior-build" output="friendly-shot"/>
    <satisfy output="right" candidate="prior"/>
  </svrun>`);
  const run = await resolveRunDocument(compiled.document, {
    compilation,
    fragments: new RunFragmentRegistry(),
  });
  const candidate = run.graph.satisfactions[0]!.candidate;
  assert.deepEqual(run.candidateSources[candidate], {
    kind: "build-output",
    build: "prior-build",
    output: "friendly-shot",
  });
  assert.equal(run.graph.candidates.find((item) => item.id === candidate)?.root.kind, "value");
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
  });
  assert.equal(run.graph.operations.length, 0);
  assert.equal(run.graph.targets[0]?.output, "left");
});
