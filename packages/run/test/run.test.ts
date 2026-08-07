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
  sealTypedModule,
  start,
} from "@svml/core";
import {
  sealGraphFragment,
} from "@svml/elaborator";
import type { CompiledSourceClosure } from "@svml/elaborator";
import type { ModuleManifest, ProducerRef, TypeRef } from "@svml/protocol";
import { resolveRealization } from "@svml/realization";
import {
  compileRunSource,
  createRunFragmentHostFacet,
  installRunFragmentHostFacets,
  resolveRunDocument,
  RunFragmentRegistry,
  RunFrontendRegistry,
  RunSourceError,
  verifyRunSourceClosure,
} from "@svml/run";
import { parseRunDocument, runTextFrontend } from "@svml/run-text";

const moduleRef = { name: "example.run", version: "1" } as const;
const promptType = { module: moduleRef, name: "Prompt" } satisfies TypeRef;
const mediaType = { module: moduleRef, name: "Media" } satisfies TypeRef;
const defaultProducer = { module: moduleRef, name: "default" } satisfies ProducerRef;
const previewProducer = { module: moduleRef, name: "preview" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "svml.module@0",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    { name: promptType.name, schema: { kind: "string" } },
    { name: mediaType.name, schema: { kind: "string" } },
  ],
  capabilities: [],
  surfaces: [],
  producers: [defaultProducer, previewProducer].map((producer) => ({
    name: producer.name,
    inputs: [{ name: "prompt", type: promptType }],
    outputs: [{ name: "media", type: mediaType }],
    needs: [],
    implementation: {
      kind: "registered" as const,
      locator: `example.run/${producer.name}`,
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
    conformance: "exact",
    origin: {
      kind: "authored",
      sourceDigest: digestOf("run-source"),
      frontendClosureDigest: digestOf("run-frontend"),
    },
  });
  const program = link(closure, [sealTypedModule({
    id: "author:run",
    closureDigest: closure.digest,
    records: [prompt],
  })]);
  const graph = sealCompiledGraph({
    program: program.semanticDigest,
    outputs: ["left", "right"].map((id) => ({
      id,
      type: mediaType,
      primary: "default:candidate",
      semanticInputs: [{ kind: "record" as const, id: prompt.id }],
    })),
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
    elaboration: { graph },
    exports: [
      { name: "prompt", type: promptType, ref: { kind: "record", id: prompt.id } },
      { name: "left", type: mediaType, ref: { kind: "logical-output", id: "left" } },
      { name: "right", type: mediaType, ref: { kind: "logical-output", id: "right" } },
    ],
  } as unknown as CompiledSourceClosure;
}

function previewFragment() {
  const input = { kind: "fragment-input" as const, name: "prompt" };
  const operation = { kind: "fragment-operation" as const, operation: "preview" };
  return sealGraphFragment({
    name: "shared-preview",
    inputs: [{ name: "prompt", type: promptType }],
    operations: [{
      id: "preview",
      producer: previewProducer,
      inputs: { prompt: input },
      result: { kind: "output", name: "media" },
    }],
    exports: ["first", "second"].map((name) => ({
      name,
      type: mediaType,
      root: operation,
      semanticInputs: ["prompt"],
      fidelity: "substitute" as const,
    })),
  });
}

test("Run Fragments enter the Host only through the locked Run facet ABI", () => {
  const fragment = previewFragment();
  const facet = createRunFragmentHostFacet({
    name: "@example/run-preview",
    fragments: { shared: fragment },
  });
  const registry = new RunFragmentRegistry();
  installRunFragmentHostFacets([facet], registry);
  assert.equal(registry.resolve("@example/run-preview", "shared")?.id, fragment.id);
  assert.throws(
    () => installRunFragmentHostFacets([{
      ...facet,
      identity: {
        contract: "svml.run-fragment-host-facet@1",
        package: "@example/tampered",
        exports: facet.identity.exports,
      },
    }], new RunFragmentRegistry()),
    /differs from its locked identity/u,
  );
});

async function compileDocument(body: string) {
  const frontends = new RunFrontendRegistry();
  frontends.register(runTextFrontend);
  return await compileRunSource({
    id: "/project/build.svrun",
    name: "build.svrun",
    text: `<?svml using="@svml/run-text@1"?>\n${body}`,
  }, frontends);
}

test(".svrun compiles one multi-export Fragment instance before execution", async () => {
  const compiledRunSource = await compileDocument(`<svrun version="1" targets="preview">
    <author source="./main.svml"/>
    <import from="@example/run-preview" as="preview"/>
    <target-set id="preview">
      <target output="left" accepts="substitute"/>
      <target output="right" accepts="substitute"/>
    </target-set>
    <fragment id="one-call" using="preview:shared">
      <input name="prompt" from="prompt"/>
    </fragment>
    <satisfy output="left" candidate="one-call.first" fidelity="substitute"/>
    <satisfy output="right" candidate="one-call.second" fidelity="substitute"/>
  </svrun>`);
  const document = compiledRunSource.document;
  const compilation = fixture();
  const fragments = new RunFragmentRegistry();
  fragments.register({ name: "@example/run-preview", fragments: { shared: previewFragment() } });
  const run = await resolveRunDocument(document, {
    compilation,
    sourceClosure: compiledRunSource.closure,
    fragments,
    readStoredValue() { throw new Error("not used"); },
    readBuild() { throw new Error("not used"); },
  });
  assert.equal(run.graph.operations.length, 1);
  assert.equal(Object.keys(run.candidates).length, 2);
  const realized = resolveRealization(
    compilation.program,
    compilation.elaboration.graph,
    [run.overlay!],
  );
  const request = sealBuildRequest({
    graph: realized.graph.id,
    targets: run.graph.targetSets[0]!.targets,
    satisfactions: run.graph.satisfactions,
  });
  const state = start(compilation.program, realized.graph, request);
  assert.equal(state.plan.steps.length, 1);
  assert.equal(state.plan.steps[0]!.producer.name, "preview");
});

test("separate Fragment declarations remain separate executions", async () => {
  const compiledRunSource = await compileDocument(`<svrun version="1" targets="preview">
    <author source="./main.svml"/>
    <import from="@example/run-preview" as="preview"/>
    <target-set id="preview"><target output="left" accepts="substitute"/><target output="right" accepts="substitute"/></target-set>
    <fragment id="left-call" using="preview:shared"><input name="prompt" from="prompt"/><export name="first"/></fragment>
    <fragment id="right-call" using="preview:shared"><input name="prompt" from="prompt"/><export name="second"/></fragment>
    <satisfy output="left" candidate="left-call.first" fidelity="substitute"/>
    <satisfy output="right" candidate="right-call.second" fidelity="substitute"/>
  </svrun>`);
  const document = compiledRunSource.document;
  const compilation = fixture();
  const fragments = new RunFragmentRegistry();
  fragments.register({ name: "@example/run-preview", fragments: { shared: previewFragment() } });
  const run = await resolveRunDocument(document, {
    compilation,
    sourceClosure: compiledRunSource.closure,
    fragments,
    readStoredValue() { throw new Error("not used"); },
    readBuild() { throw new Error("not used"); },
  });
  assert.equal(run.graph.operations.length, 2);
  assert.equal(new Set(run.graph.operations.map((item) => item.id)).size, 2);
});

test("a Provided Value is an ordinary zero-input Candidate selected by Satisfaction", async () => {
  const compiledRunSource = await compileDocument(`<svrun version="1" targets="preview">
    <author source="./main.svml"/>
    <target-set id="preview"><target output="left" accepts="substitute"/></target-set>
    <value id="fixed" type="example.run@1#Media" from="./fixed.json"/>
    <satisfy output="left" candidate="fixed" fidelity="substitute"/>
  </svrun>`);
  const document = compiledRunSource.document;
  const compilation = fixture();
  const run = await resolveRunDocument(document, {
    compilation,
    sourceClosure: compiledRunSource.closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue(from) {
      assert.equal(from, "./fixed.json");
      return { kind: "inline", value: "already rendered" };
    },
    readBuild() { throw new Error("not used"); },
  });
  const realized = resolveRealization(compilation.program, compilation.elaboration.graph, [run.overlay!]);
  const state = start(compilation.program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: run.graph.targetSets[0]!.targets,
    satisfactions: run.graph.satisfactions,
  }));
  assert.equal(state.plan.steps.length, 0);
  assert.equal(state.records.find((item) => item.id === state.plan.goals[0]!.record)?.value.kind, "inline");
});

test("a Build Record uses the Host Catalog alias without putting presentation names in Core", async () => {
  const compilation = fixture();
  let historical = start(compilation.program, compilation.elaboration.graph, sealBuildRequest({
    graph: compilation.elaboration.graph.id,
    targets: [{ output: "left", accepts: "exact" }],
    satisfactions: [],
  }));
  historical = reduce(historical).state;
  const command = historical.outstanding.find((item) => item.kind === "invoke-producer");
  assert.ok(command);
  const content = {
    kind: "producer-completed" as const,
    command: command.id,
    outputs: { media: { kind: "inline" as const, value: "archived media" } },
    needs: {},
    validations: {},
  };
  historical = reduce(historical, { ...content, id: `event:${digestOf(content)}` }).state;
  assert.equal(historical.status, "complete");

  const compiledRunSource = await compileDocument(`<svrun version="1" targets="delivery">
    <author source="./main.svml"/>
    <target-set id="delivery"><target output="right" accepts="substitute"/></target-set>
    <build-record id="prior" build="prior-build" output="friendly-shot"/>
    <satisfy output="right" candidate="prior" fidelity="substitute"/>
  </svrun>`);
  let resolvedAlias = false;
  const run = await resolveRunDocument(compiledRunSource.document, {
    compilation,
    sourceClosure: compiledRunSource.closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readBuild(id) {
      assert.equal(id, "prior-build");
      return historical;
    },
    resolveBuildOutput(id, output) {
      assert.equal(id, "prior-build");
      assert.equal(output, "friendly-shot");
      resolvedAlias = true;
      return "left";
    },
  });
  assert.equal(resolvedAlias, true);
  const realized = resolveRealization(compilation.program, compilation.elaboration.graph, [run.overlay!]);
  const state = start(compilation.program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: run.graph.targetSets[0]!.targets,
    satisfactions: run.graph.satisfactions,
  }));
  assert.equal(state.plan.steps.length, 0);
  assert.equal(state.plan.initialValues[0]?.conformance, "substitute");
});

test("Run imports are a prologue and Runtime settings are not language elements", () => {
  assert.throws(
    () => parseRunDocument("bad.svrun", `<svrun version="1" targets="x">
      <author source="./main.svml"/>
      <target-set id="x"><target output="film" accepts="exact"/></target-set>
      <import from="@example/run" as="run"/>
    </svrun>`),
    /opening prologue/u,
  );
  assert.throws(
    () => parseRunDocument("bad.svrun", `<svrun version="1" targets="x">
      <author source="./main.svml"/>
      <target-set id="x"><target output="film" accepts="exact"/></target-set>
      <provider name="kie"/>
    </svrun>`),
    /does not accept <provider>/u,
  );
});

test("a Target-only execution still compiles one mandatory Run Graph", async () => {
  const compiledRunSource = await compileDocument(`<svrun version="1" targets="delivery">
    <author source="./main.svml"/>
    <target-set id="delivery"><target output="left" accepts="exact"/></target-set>
  </svrun>`);
  const compilation = fixture();
  const run = await resolveRunDocument(compiledRunSource.document, {
    compilation,
    sourceClosure: compiledRunSource.closure,
    fragments: new RunFragmentRegistry(),
    readStoredValue() { throw new Error("not used"); },
    readBuild() { throw new Error("not used"); },
  });
  assert.equal(run.overlay, undefined);
  assert.equal(run.graph.authorGraph, compilation.elaboration.graph.id);
  assert.equal(run.graph.sourceClosure, compiledRunSource.closure.id);
  assert.equal(run.graph.operations.length, 0);
  assert.equal(run.graph.targetSets[0]?.targets[0]?.output, "left");
});

test("Run Source Closure binds source bytes, Frontend implementation and semantic meaning separately", async () => {
  const first = await compileDocument(`<svrun version="1" targets="delivery">
    <author source="./main.svml"/>
    <target-set id="delivery"><target output="left" accepts="exact"/></target-set>
  </svrun>`);
  const second = await compileDocument(`<svrun version="1" targets="delivery">
    <author source="./main.svml"/>

    <target-set id="delivery"><target output="left" accepts="exact"/></target-set>
  </svrun>`);
  assert.notEqual(first.closure.id, second.closure.id);
  assert.equal(first.closure.units[0]?.semanticDigest, second.closure.units[0]?.semanticDigest);
  const unit = first.closure.units[0]!;
  assert.throws(
    () => verifyRunSourceClosure({
      ...first.closure,
      units: [{ ...unit, sourceDigest: digestOf("tampered") }],
    }),
    (error: unknown) => error instanceof RunSourceError && error.code === "RUN_SOURCE_UNIT_DIGEST_MISMATCH",
  );

  const alternate = {
    ...runTextFrontend,
    id: "example.run-text-compatible@1",
    implementationDigest: digestOf("example.run-text-compatible/implementation@1"),
  };
  const frontends = new RunFrontendRegistry();
  frontends.register(alternate);
  const equivalent = await compileRunSource({
    id: "/project/equivalent.svrun",
    name: "equivalent.svrun",
    text: `<?svml using="${alternate.id}"?>\n<svrun version="1" targets="delivery">
      <author source="./main.svml"/>
      <target-set id="delivery"><target output="left" accepts="exact"/></target-set>
    </svrun>`,
  }, frontends);
  assert.notEqual(first.closure.id, equivalent.closure.id);
  assert.equal(first.closure.units[0]?.semanticDigest, equivalent.closure.units[0]?.semanticDigest);
});
