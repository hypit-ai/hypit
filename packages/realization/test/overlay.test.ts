import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  EMPTY_REALIZATION_DIGEST,
  link,
  reduce,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";
import {
  elaborateGraphFragment,
  exportRunFragment,
  sealGraphFragment,
} from "@svml/elaborator";
import type {
  BuildState,
  CompiledGraph,
  LinkedProgram,
  InvokeProducerCommand,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";
import {
  createBuildRecordCandidate,
  createProvidedCandidate,
  resolveRealization,
  sealRealizationOverlay,
  verifyResolvedRealization,
} from "@svml/realization";

const moduleRef = { name: "example.realization", version: "0.0.0" } as const;
const types = {
  prompt: { module: moduleRef, name: "Prompt" },
  media: { module: moduleRef, name: "Media" },
} satisfies Record<string, TypeRef>;
const producers = {
  generate: { module: moduleRef, name: "generate" },
  preview: { module: moduleRef, name: "preview" },
} satisfies Record<string, ProducerRef>;

const manifest: ModuleManifest = {
  format: "svml.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    { name: types.prompt.name, schema: { kind: "string", minLength: 1 } },
    { name: types.media.name, schema: { kind: "string", minLength: 1 } },
  ],
  capabilities: [],
  surfaces: [],
  producers: [
    {
      name: producers.generate.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      outputs: [{ name: "media", type: types.media }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.realization/generate",
        digest: digestOf("example.realization/generate@1"),
      },
    },
    {
      name: producers.preview.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      outputs: [{ name: "media", type: types.media }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.realization/preview",
        digest: digestOf("example.realization/preview@1"),
      },
    },
  ],
};

function fixture(): { readonly program: LinkedProgram; readonly source: CompiledGraph } {
  const closure = createResolvedClosure([manifest]);
  const authored = sealRecord({
    id: "prompt:shot",
    type: types.prompt,
    value: { kind: "inline", value: "A founder speaking to camera." },
    conformance: "exact",
    origin: {
      kind: "authored",
      sourceDigest: digestOf("source:realization"),
      frontendClosureDigest: digestOf("frontend:realization"),
    },
  });
  const program = link(closure, [sealTypedModule({
    id: "author:realization",
    closureDigest: closure.digest,
    records: [authored],
  })]);
  const source = sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [{
      id: "shot.visual",
      type: types.media,
      primary: "shot.generate",
      semanticInputs: [{ kind: "record", id: "prompt:shot" }],
    }],
    candidates: [{
      id: "shot.generate",
      type: types.media,
      root: {
        kind: "operation",
        result: { kind: "operation-result", operation: "generate-shot" },
      },
    }],
    operations: [{
      id: "generate-shot",
      producer: producers.generate,
      inputs: { prompt: { kind: "record", id: "prompt:shot" } },
      result: { kind: "output", name: "media", record: "media:generated" },
    }],
  });
  return { program, source };
}

function providedOverlay(source: CompiledGraph, value: string, label: string) {
  const candidate = createProvidedCandidate({
    type: types.media,
    value: { kind: "inline", value },
    provenance: { library: "approved-shots", label },
  });
  return {
    candidate,
    overlay: sealRealizationOverlay({
      sourceGraph: source.id,
      candidates: [candidate],
      operations: [],
    }),
  };
}

function completedBuild(): { readonly program: LinkedProgram; readonly source: CompiledGraph; readonly state: BuildState } {
  const base = fixture();
  const source = sealCompiledGraph({
    program: base.source.program,
    outputs: base.source.outputs,
    candidates: base.source.candidates,
    operations: base.source.operations,
  });
  const initial = start(base.program, source, sealBuildRequest({
    graph: source.id,
    targets: [{ output: "shot.visual", accepts: "exact" }],
    satisfactions: [],
  }));
  const ready = reduce(initial);
  const command = ready.commands.find((item): item is InvokeProducerCommand => item.kind === "invoke-producer");
  assert.ok(command);
  const completed = reduce(ready.state, {
    kind: "producer-completed",
    id: "event:historical-media",
    command: command.id,
    outputs: { media: { kind: "inline", value: "A founder speaking to camera." } },
    needs: {},
  });
  assert.equal(completed.state.status, "complete");
  return { program: base.program, source, state: completed.state };
}

test("an attached Existing Value is inert until BuildRequest explicitly selects it", () => {
  const { program, source } = fixture();
  const { overlay, candidate } = providedOverlay(source, "approved video", "v1");
  const realized = resolveRealization(program, source, [overlay]);
  assert.equal(source.realization, EMPTY_REALIZATION_DIGEST);
  assert.equal(realized.graph.source, source.source);
  assert.equal(realized.graph.realization, realized.closure.id);
  assert.notEqual(realized.graph.id, source.id);

  const primary = start(program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: [{ output: "shot.visual", accepts: "exact" }],
    satisfactions: [],
  }));
  assert.deepEqual(primary.plan.steps.map((step) => step.id), ["generate-shot"]);
  assert.deepEqual(primary.plan.initialValues, []);

  const selected = start(program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: [{ output: "shot.visual", accepts: "exact" }],
    satisfactions: [{ output: "shot.visual", candidate: candidate.id, fidelity: "exact" }],
  }));
  assert.deepEqual(selected.plan.steps, []);
  assert.equal(selected.plan.initialValues[0]?.value.kind, "inline");
  assert.equal(selected.plan.selections[0]?.candidate, candidate.id);
});

test("a historical Record becomes an ordinary substitute zero-edge Candidate", () => {
  const { program, source, state: historical } = completedBuild();
  const candidate = createBuildRecordCandidate({ build: historical, sourceOutput: "shot.visual" });
  assert.equal(candidate.root.kind, "value");
  assert.deepEqual(candidate.type, types.media);
  const overlay = sealRealizationOverlay({ sourceGraph: source.id, candidates: [candidate], operations: [] });
  const realized = resolveRealization(program, source, [overlay]);
  const fresh = start(program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: [{ output: "shot.visual", accepts: "substitute" }],
    satisfactions: [{ output: "shot.visual", candidate: candidate.id, fidelity: "substitute" }],
  }));
  assert.deepEqual(fresh.plan.steps, []);
  assert.equal(fresh.plan.initialValues.length, 1);
  assert.equal(fresh.plan.initialValues[0]?.conformance, "substitute");
  assert.notEqual(fresh.id, historical.id);
});

test("a fixed black value substitutes an Output without any history or semantic proof", () => {
  const { program, source } = completedBuild();
  const candidate = createProvidedCandidate({
    type: types.media,
    value: { kind: "inline", value: "UNRELATED FIXED BLACK VIDEO" },
  });
  const overlay = sealRealizationOverlay({ sourceGraph: source.id, candidates: [candidate], operations: [] });
  const realized = resolveRealization(program, source, [overlay]);
  const fresh = start(program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: [{ output: "shot.visual", accepts: "substitute" }],
    satisfactions: [{ output: "shot.visual", candidate: candidate.id, fidelity: "substitute" }],
  }));
  assert.deepEqual(fresh.plan.steps, []);
  assert.equal(fresh.plan.initialValues.length, 1);
  assert.deepEqual(fresh.plan.initialValues[0]?.value, {
    kind: "inline",
    value: "UNRELATED FIXED BLACK VIDEO",
  });
  assert.equal(fresh.plan.initialValues[0]?.conformance, "substitute");
});

test("a historical Record may substitute another author graph and Output without semantic proof", () => {
  const { program, source, state: historical } = completedBuild();
  const other = sealCompiledGraph({
    program: source.program,
    outputs: source.outputs.map((output) => ({ ...output, id: "replacement.visual" })),
    candidates: source.candidates,
    operations: source.operations,
  });
  const candidate = createBuildRecordCandidate({
    build: historical,
    sourceOutput: "shot.visual",
  });
  assert.deepEqual(candidate.type, types.media);
  const overlay = sealRealizationOverlay({ sourceGraph: other.id, candidates: [candidate], operations: [] });
  const realized = resolveRealization(program, other, [overlay]);

  assert.throws(() => start(program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: [{ output: "replacement.visual", accepts: "exact" }],
    satisfactions: [{ output: "replacement.visual", candidate: candidate.id, fidelity: "substitute" }],
  })), /selects a substitute path/u);

  const fresh = start(program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: [{ output: "replacement.visual", accepts: "substitute" }],
    satisfactions: [{ output: "replacement.visual", candidate: candidate.id, fidelity: "substitute" }],
  }));
  assert.deepEqual(fresh.plan.steps, []);
  assert.equal(fresh.plan.initialValues[0]?.conformance, "substitute");
});

test("changing the attached Value changes Overlay, realized Graph and BuildRequest identity", () => {
  const { program, source } = fixture();
  const left = providedOverlay(source, "approved video A", "A");
  const right = providedOverlay(source, "approved video B", "B");
  const realizedLeft = resolveRealization(program, source, [left.overlay]);
  const realizedRight = resolveRealization(program, source, [right.overlay]);
  assert.notEqual(left.overlay.id, right.overlay.id);
  assert.notEqual(realizedLeft.graph.id, realizedRight.graph.id);

  const requestLeft = sealBuildRequest({
    graph: realizedLeft.graph.id,
    targets: [{ output: "shot.visual", accepts: "exact" }],
    satisfactions: [{ output: "shot.visual", candidate: left.candidate.id, fidelity: "exact" }],
  });
  const requestRight = sealBuildRequest({
    graph: realizedRight.graph.id,
    targets: [{ output: "shot.visual", accepts: "exact" }],
    satisfactions: [{ output: "shot.visual", candidate: right.candidate.id, fidelity: "exact" }],
  });
  assert.notEqual(requestLeft.digest, requestRight.digest);
});

test("Overlay order is not semantic and the resolved closure is verifiable", () => {
  const { program, source } = fixture();
  const left = providedOverlay(source, "approved video A", "A").overlay;
  const right = providedOverlay(source, "approved video B", "B").overlay;
  const forward = resolveRealization(program, source, [left, right]);
  const reverse = resolveRealization(program, source, [right, left]);
  assert.equal(forward.closure.id, reverse.closure.id);
  assert.equal(forward.graph.id, reverse.graph.id);
  verifyResolvedRealization(program, source, forward, [right, left]);
});

test("a static Fragment export can be attached as an external Candidate", () => {
  const { program, source } = fixture();
  const fragment = sealGraphFragment({
    name: "black-preview",
    inputs: [{ name: "prompt", type: types.prompt }],
    operations: [{
      id: "preview",
      producer: producers.preview,
      inputs: { prompt: { kind: "fragment-input", name: "prompt" } },
      result: { kind: "output", name: "media" },
    }],
    exports: [{
      name: "visual",
      type: types.media,
      root: { kind: "fragment-operation", operation: "preview" },
      semanticInputs: ["prompt"],
      fidelity: "substitute",
    }],
  });
  const instance = elaborateGraphFragment(program, fragment, {
    id: "shot-black-preview",
    fragment: fragment.id,
    inputs: { prompt: { kind: "record", id: "prompt:shot" } },
  });
  const contribution = exportRunFragment(instance, ["visual"]);
  const overlay = sealRealizationOverlay({
    sourceGraph: source.id,
    candidates: contribution.candidates,
    operations: contribution.operations,
  });
  const realized = resolveRealization(program, source, [overlay]);
  const exported = contribution.exports[0]!;
  const state = start(program, realized.graph, sealBuildRequest({
    graph: realized.graph.id,
    targets: [{ output: "shot.visual", accepts: "substitute" }],
    satisfactions: [{
      output: "shot.visual",
      candidate: exported.candidate,
      fidelity: exported.suggestedFidelity,
    }],
  }));
  assert.equal(state.plan.steps.length, 1);
  assert.equal(state.plan.steps[0]?.producer.name, "preview");
  assert.equal(state.plan.steps.some((step) => step.id === "generate-shot"), false);
});

test("tampered and cross-graph Overlays are rejected before Candidate selection", () => {
  const { program, source } = fixture();
  const { overlay } = providedOverlay(source, "approved video", "v1");
  const tampered = {
    ...overlay,
    candidates: overlay.candidates.map((candidate) => ({ ...candidate, type: types.prompt })),
  };
  assert.throws(() => resolveRealization(program, source, [tampered]), /Overlay digest differs/u);

  const otherSource = sealCompiledGraph({
    program: source.program,
    outputs: source.outputs.map((output) => ({ ...output, id: "other.visual" })),
    candidates: source.candidates,
    operations: source.operations,
  });
  assert.throws(
    () => resolveRealization(program, otherSource, [overlay]),
    /targets another author graph/u,
  );
});
