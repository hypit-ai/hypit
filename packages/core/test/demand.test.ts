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
  verifyBuildState,
} from "@svml/core";
import type {
  BuildRequest,
  BuildState,
  Candidate,
  CandidateBinding,
  CanonicalValue,
  CompiledGraph,
  GraphValueRef,
  LinkedProgram,
  LogicalOutput,
  ModuleManifest,
  OperationNode,
  OperationResultRef,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";

const moduleRef = { name: "example.kernel-demand", version: "0.0.0" } as const;
const types = {
  head: { module: moduleRef, name: "Head" },
  duration: { module: moduleRef, name: "Duration" },
  image: { module: moduleRef, name: "Image" },
  imageSet: { module: moduleRef, name: "ImageSet" },
  a: { module: moduleRef, name: "A" },
  b: { module: moduleRef, name: "B" },
  c: { module: moduleRef, name: "C" },
  d: { module: moduleRef, name: "D" },
  combined: { module: moduleRef, name: "Combined" },
} satisfies Record<string, TypeRef>;

const producer = (name: string): ProducerRef => ({ module: moduleRef, name });
const producers = {
  p1: producer("image-1"),
  p2: producer("image-2"),
  p3: producer("image-3"),
  collect: producer("collect-images"),
  seedance: producer("seedance-media"),
  black: producer("black-by-duration"),
  a1: producer("a1"),
  a2: producer("a2"),
  b1: producer("b1"),
  b2: producer("b2"),
  c: producer("c"),
};
const seedanceCapability = { module: moduleRef, name: "seedance-media" } as const;

const implementation = (name: string) => ({
  kind: "test",
  locator: name,
  digest: digestOf(`${name}@1`),
});

const manifest: ModuleManifest = {
  format: "svml.module@0",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    { name: types.head.name, schema: { kind: "string", minLength: 1 } },
    { name: types.duration.name, schema: { kind: "number", minimum: 0 } },
    { name: types.image.name, schema: { kind: "string", minLength: 1 } },
    { name: types.imageSet.name, schema: { kind: "array", items: { kind: "string" }, minItems: 1 } },
    ...[types.a, types.b, types.c, types.d, types.combined].map((type) => ({
      name: type.name,
      schema: { kind: "string" as const, minLength: 1 },
    })),
  ],
  capabilities: [{ name: seedanceCapability.name, returns: types.image }],
  surfaces: [],
  producers: [
    {
      name: producers.p1.name,
      inputs: [{ name: "head", type: types.head }],
      outputs: [{ name: "image", type: types.image }],
      needs: [],
      implementation: implementation("p1"),
    },
    {
      name: producers.p2.name,
      inputs: [{ name: "head", type: types.head }, { name: "image1", type: types.image }],
      outputs: [{ name: "image", type: types.image }],
      needs: [],
      implementation: implementation("p2"),
    },
    {
      name: producers.p3.name,
      inputs: [
        { name: "head", type: types.head },
        { name: "image1", type: types.image },
        { name: "image2", type: types.image },
      ],
      outputs: [{ name: "image", type: types.image }],
      needs: [],
      implementation: implementation("p3"),
    },
    {
      name: producers.collect.name,
      inputs: [
        { name: "image1", type: types.image },
        { name: "image2", type: types.image },
        { name: "image3", type: types.image },
      ],
      outputs: [{ name: "images", type: types.imageSet }],
      needs: [],
      implementation: implementation("collect"),
    },
    {
      name: producers.seedance.name,
      inputs: [
        { name: "head", type: types.head },
        { name: "duration", type: types.duration },
        { name: "reference1", type: types.image },
        { name: "reference2", type: types.image },
      ],
      outputs: [],
      needs: [{ name: "media", capability: seedanceCapability, returns: types.image }],
      implementation: implementation("seedance"),
    },
    {
      name: producers.black.name,
      inputs: [{ name: "duration", type: types.duration }],
      outputs: [{ name: "media", type: types.image }],
      needs: [],
      implementation: implementation("black"),
    },
    ...[
      [producers.a1, "value", types.a],
      [producers.a2, "value", types.b],
    ].map(([ref, name, type]) => ({
      name: (ref as ProducerRef).name,
      inputs: [],
      outputs: [{ name: name as string, type: type as TypeRef }],
      needs: [],
      implementation: implementation((ref as ProducerRef).name),
    })),
    {
      name: producers.b1.name,
      inputs: [{ name: "A", type: types.a }, { name: "B", type: types.b }],
      outputs: [{ name: "C", type: types.c }],
      needs: [],
      implementation: implementation("b1"),
    },
    {
      name: producers.b2.name,
      inputs: [{ name: "A", type: types.a }, { name: "B", type: types.b }],
      outputs: [{ name: "D", type: types.d }],
      needs: [],
      implementation: implementation("b2"),
    },
    {
      name: producers.c.name,
      inputs: [{ name: "C", type: types.c }, { name: "D", type: types.d }],
      outputs: [{ name: "combined", type: types.combined }],
      needs: [],
      implementation: implementation("c"),
    },
  ],
};

const recordRef = (id: string): GraphValueRef => ({ kind: "record", id });
const outputRef = (id: string): GraphValueRef => ({ kind: "logical-output", id });
const operationRef = (operation: string): OperationResultRef => ({ kind: "operation-result", operation });

function output(
  id: string,
  type: TypeRef,
  primary: string,
  candidates: readonly string[],
  semanticInputs: readonly GraphValueRef[],
): LogicalOutput {
  return { id, type, primary, candidates, semanticInputs };
}

function candidate(
  id: string,
  outputId: string,
  operation: string,
  fidelity: "exact" | "substitute" = "exact",
): Candidate {
  return { id, output: outputId, root: { kind: "operation", result: operationRef(operation) }, fidelity };
}

function providedCandidate(
  id: string,
  outputId: string,
  record: string,
  value: CanonicalValue,
  fidelity: "exact" | "substitute" = "exact",
): Candidate {
  return {
    id,
    output: outputId,
    root: { kind: "value", value: { id: record, value: { kind: "inline", value }, provenance: { test: id } } },
    fidelity,
  };
}

function operation(
  id: string,
  producerRef: ProducerRef,
  inputs: Readonly<Record<string, GraphValueRef>>,
  result: OperationNode["result"],
): OperationNode {
  return { id, producer: producerRef, inputs, result };
}

function createProgram(): LinkedProgram {
  const closure = createResolvedClosure([manifest]);
  const authored = [
    sealRecord({
      id: "head:root",
      type: types.head,
      value: { kind: "inline", value: "reference" },
      conformance: "exact",
      origin: { kind: "authored", sourceDigest: digestOf("source:demand"), frontendClosureDigest: digestOf("frontend:demand") },
    }),
    sealRecord({
      id: "duration:root",
      type: types.duration,
      value: { kind: "inline", value: 3 },
      conformance: "exact",
      origin: { kind: "authored", sourceDigest: digestOf("source:demand"), frontendClosureDigest: digestOf("frontend:demand") },
    }),
    sealRecord({
      id: "duration:other",
      type: types.duration,
      value: { kind: "inline", value: 9 },
      conformance: "exact",
      origin: { kind: "authored", sourceDigest: digestOf("source:demand"), frontendClosureDigest: digestOf("frontend:demand") },
    }),
  ];
  return link(closure, [sealTypedModule({ id: "author:demand", closureDigest: closure.digest, records: authored })]);
}

function createImageGraph(program: LinkedProgram): CompiledGraph {
  return sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      output("image1", types.image, "p1", ["p1", "existing-image1"], [recordRef("head:root")]),
      output("image2", types.image, "p2", ["p2", "existing-image2"], [recordRef("head:root"), outputRef("image1")]),
      output("image3", types.image, "p3", ["p3", "existing-image3"], [recordRef("head:root"), outputRef("image1"), outputRef("image2")]),
      output("images", types.imageSet, "collect", ["collect"], [outputRef("image1"), outputRef("image2"), outputRef("image3")]),
      output("media", types.image, "seedance", ["seedance", "black", "existing-media"], [
        recordRef("head:root"),
        recordRef("duration:root"),
        outputRef("image1"),
        outputRef("image2"),
      ]),
    ],
    candidates: [
      candidate("p1", "image1", "p1"),
      candidate("p2", "image2", "p2"),
      candidate("p3", "image3", "p3"),
      candidate("collect", "images", "collect"),
      candidate("seedance", "media", "seedance"),
      candidate("black", "media", "black", "substitute"),
      providedCandidate("existing-image1", "image1", "provided:image1", "I1"),
      providedCandidate("existing-image2", "image2", "provided:image2", "I2"),
      providedCandidate("existing-image3", "image3", "provided:image3", "I3"),
      providedCandidate("existing-media", "media", "provided:media", "EXISTING MEDIA"),
    ],
    operations: [
      operation("p1", producers.p1, { head: recordRef("head:root") }, { kind: "output", name: "image", record: "image:1" }),
      operation("p2", producers.p2, { head: recordRef("head:root"), image1: outputRef("image1") }, { kind: "output", name: "image", record: "image:2" }),
      operation("p3", producers.p3, { head: recordRef("head:root"), image1: outputRef("image1"), image2: outputRef("image2") }, { kind: "output", name: "image", record: "image:3" }),
      operation("collect", producers.collect, { image1: outputRef("image1"), image2: outputRef("image2"), image3: outputRef("image3") }, { kind: "output", name: "images", record: "images:all" }),
      operation("seedance", producers.seedance, {
        head: recordRef("head:root"),
        duration: recordRef("duration:root"),
        reference1: outputRef("image1"),
        reference2: outputRef("image2"),
      }, { kind: "need", name: "media", id: "need:seedance", record: "media:seedance", accepts: "exact" }),
      operation("black", producers.black, { duration: recordRef("duration:root") }, { kind: "output", name: "media", record: "media:black" }),
    ],
  });
}

function request(
  graph: CompiledGraph,
  targets: readonly string[],
  bindings: readonly CandidateBinding[] = [],
  accepts: "exact" | "substitute" = "substitute",
): BuildRequest {
  return sealBuildRequest({
    graph: graph.id,
    targets: targets.map((outputId) => ({ output: outputId, accepts })),
    bindings,
  });
}

function fixture(targets: readonly string[], bindings: readonly CandidateBinding[] = []): BuildState {
  const program = createProgram();
  const graph = createImageGraph(program);
  return start(program, graph, request(graph, targets, bindings));
}

function choose(outputId: string, candidateId: string): CandidateBinding {
  return { output: outputId, candidate: candidateId };
}

function stepIds(state: BuildState): string[] {
  return state.plan.steps.map((step) => step.id).sort();
}

test("Targets and Existing-Value Candidates derive the exact image closure", () => {
  const cases: readonly [string, readonly CandidateBinding[], readonly string[]][] = [
    ["image3", [], ["p1", "p2", "p3"]],
    ["image3", [choose("image1", "existing-image1")], ["p2", "p3"]],
    ["image3", [choose("image1", "existing-image1"), choose("image2", "existing-image2")], ["p3"]],
    ["image3", [choose("image3", "existing-image3")], []],
    ["image2", [], ["p1", "p2"]],
    ["image1", [], ["p1"]],
  ];
  for (const [target, bindings, expected] of cases) {
    assert.deepEqual(stepIds(fixture([target], bindings)), expected);
  }
});

test("an ordinary aggregator intentionally demands every selected image", () => {
  assert.deepEqual(stepIds(fixture(["images"])), ["collect", "p1", "p2", "p3"]);
  assert.deepEqual(stepIds(fixture(["images"], [
    choose("image1", "existing-image1"),
    choose("image2", "existing-image2"),
  ])), ["collect", "p3"]);
});

test("multiple Targets share Operations once and target order is not semantic", () => {
  const first = fixture(["image3", "image2"]);
  const second = fixture(["image2", "image3"]);
  assert.deepEqual(stepIds(first), ["p1", "p2", "p3"]);
  assert.equal(new Set(first.plan.steps.map((step) => step.id)).size, first.plan.steps.length);
  assert.equal(first.request.digest, second.request.digest);
  assert.equal(first.plan.id, second.plan.id);
});

test("the selected Candidate alone determines the demanded semantic inputs", () => {
  assert.deepEqual(stepIds(fixture(["media"])), ["p1", "p2", "seedance"]);
  assert.deepEqual(stepIds(fixture(["media"], [choose("media", "black")])), ["black"]);
});

test("an Existing Value is a normal Candidate root and prevents the paid Need from existing", () => {
  const state = fixture(["media"], [choose("media", "existing-media")]);
  const transition = reduce(state);
  assert.deepEqual(stepIds(state), []);
  assert.equal(state.plan.initialValues.length, 1);
  assert.equal(state.plan.initialValues[0]?.origin.kind, "provided");
  assert.equal(transition.state.status, "complete");
  assert.equal(transition.state.needs.length, 0);
  assert.equal(transition.commands[0]?.kind, "complete");
});

test("a Candidate cannot escape its Logical Output Semantic Input Envelope", () => {
  const program = createProgram();
  const graph = createImageGraph(program);
  const tampered = sealCompiledGraph({
    program: graph.program,
    outputs: graph.outputs,
    candidates: graph.candidates,
    operations: graph.operations.map((item) => item.id === "black"
      ? { ...item, inputs: { duration: recordRef("duration:other") } }
      : item),
  });
  assert.throws(
    () => start(program, tampered, request(tampered, ["media"], [choose("media", "black")])),
    /outside media's Semantic Input Envelope/u,
  );
});

test("Provided Values are checked against the Logical Output Contract", () => {
  const program = createProgram();
  const graph = createImageGraph(program);
  const invalid = sealCompiledGraph({
    program: graph.program,
    outputs: graph.outputs,
    operations: graph.operations,
    candidates: graph.candidates.map((item) => item.id === "existing-image1"
      ? providedCandidate("existing-image1", "image1", "provided:image1", 42)
      : item),
  });
  assert.throws(() => start(program, invalid, request(invalid, ["image1"], [
    choose("image1", "existing-image1"),
  ], "exact")), /must be a string/u);
});

test("Provided state survives JSON round-trip and regenerates identical ready Commands", () => {
  const state = fixture(["image3"], [
    choose("image1", "existing-image1"),
    choose("image2", "existing-image2"),
  ]);
  const scheduled = reduce(state);
  const restored = JSON.parse(JSON.stringify({ ...scheduled.state, outstanding: [] })) as BuildState;
  verifyBuildState(restored);
  assert.deepEqual(reduce(restored).commands, scheduled.commands);
});

function createCaseGGraph(program: LinkedProgram, roots: "value" | "operation"): CompiledGraph {
  const a1Id = roots === "value" ? "a1-value" : "a1-operation";
  const a2Id = roots === "value" ? "a2-value" : "a2-operation";
  return sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      output("a.A", types.a, a1Id, [a1Id], []),
      output("a.B", types.b, a2Id, [a2Id], []),
      output("b.C", types.c, "b1", ["b1"], [outputRef("a.A"), outputRef("a.B")]),
      output("b.D", types.d, "b2", ["b2"], [outputRef("a.A"), outputRef("a.B")]),
      output("c.result", types.combined, "c", ["c"], [outputRef("b.C"), outputRef("b.D")]),
    ],
    candidates: [
      roots === "value"
        ? providedCandidate(a1Id, "a.A", "provided:A", "A")
        : candidate(a1Id, "a.A", "a1"),
      roots === "value"
        ? providedCandidate(a2Id, "a.B", "provided:B", "B")
        : candidate(a2Id, "a.B", "a2"),
      candidate("b1", "b.C", "b1"),
      candidate("b2", "b.D", "b2"),
      candidate("c", "c.result", "c"),
    ],
    operations: [
      operation("a1", producers.a1, {}, { kind: "output", name: "value", record: "operation:A" }),
      operation("a2", producers.a2, {}, { kind: "output", name: "value", record: "operation:B" }),
      operation("b1", producers.b1, { A: outputRef("a.A"), B: outputRef("a.B") }, { kind: "output", name: "C", record: "operation:C" }),
      operation("b2", producers.b2, { A: outputRef("a.A"), B: outputRef("a.B") }, { kind: "output", name: "D", record: "operation:D" }),
      operation("c", producers.c, { C: outputRef("b.C"), D: outputRef("b.D") }, { kind: "output", name: "combined", record: "operation:combined" }),
    ],
  });
}

test("Case G: two single-output full-input Candidates share both upstream Values", () => {
  const program = createProgram();
  const graph = createCaseGGraph(program, "value");
  const state = start(program, graph, request(graph, ["c.result"]));
  assert.deepEqual(stepIds(state), ["b1", "b2", "c"]);
  assert.deepEqual(state.plan.initialValues.map((record) => record.id), ["provided:A", "provided:B"]);
  const b1 = state.plan.steps.find((step) => step.id === "b1");
  const b2 = state.plan.steps.find((step) => step.id === "b2");
  assert.deepEqual(b1?.inputs, { A: "provided:A", B: "provided:B" });
  assert.deepEqual(b2?.inputs, { A: "provided:A", B: "provided:B" });
  assert.equal(state.plan.selections.find((item) => item.output === "b.C")?.candidate, "b1");
  assert.equal(state.plan.selections.find((item) => item.output === "b.D")?.candidate, "b2");
});

test("Case G: shared zero-input upstream Operations appear exactly once", () => {
  const program = createProgram();
  const graph = createCaseGGraph(program, "operation");
  const state = start(program, graph, request(graph, ["c.result"]));
  assert.deepEqual(stepIds(state), ["a1", "a2", "b1", "b2", "c"]);
  assert.equal(state.plan.steps.filter((step) => step.id === "a1").length, 1);
  assert.equal(state.plan.steps.filter((step) => step.id === "a2").length, 1);
  const b1 = state.plan.steps.find((step) => step.id === "b1");
  const b2 = state.plan.steps.find((step) => step.id === "b2");
  assert.deepEqual(b1?.inputs, { A: "operation:A", B: "operation:B" });
  assert.deepEqual(b2?.inputs, { A: "operation:A", B: "operation:B" });
});

function createOperationIdentityGraph(
  program: LinkedProgram,
  mode: "shared" | "distinct",
): CompiledGraph {
  return sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      output("left", types.image, "left-candidate", ["left-candidate"], [recordRef("head:root")]),
      output("right", types.image, "right-candidate", ["right-candidate"], [recordRef("head:root")]),
    ],
    candidates: [
      candidate("left-candidate", "left", "left-operation"),
      candidate(
        "right-candidate",
        "right",
        mode === "shared" ? "left-operation" : "right-operation",
      ),
    ],
    operations: [
      operation(
        "left-operation",
        producers.p1,
        { head: recordRef("head:root") },
        { kind: "output", name: "image", record: "identity:left" },
      ),
      ...(mode === "distinct"
        ? [operation(
            "right-operation",
            producers.p1,
            { head: recordRef("head:root") },
            { kind: "output", name: "image", record: "identity:right" },
          )]
        : []),
    ],
  });
}

test("two Candidates that name one OperationId demand exactly one execution", () => {
  const program = createProgram();
  const graph = createOperationIdentityGraph(program, "shared");
  const state = start(program, graph, request(graph, ["left", "right"]));
  assert.deepEqual(stepIds(state), ["left-operation"]);
  assert.deepEqual(
    state.plan.selections.map((selection) => [selection.output, selection.record]),
    [["left", "identity:left"], ["right", "identity:left"]],
  );
});

test("different OperationIds are never content-deduplicated", () => {
  const program = createProgram();
  const graph = createOperationIdentityGraph(program, "distinct");
  const state = start(program, graph, request(graph, ["left", "right"]));
  assert.deepEqual(stepIds(state), ["left-operation", "right-operation"]);
  assert.deepEqual(
    state.plan.steps.map((step) => step.producer),
    [producers.p1, producers.p1],
    "same Producer and same inputs still represent two author-declared operations",
  );
});

test("an exact Target rejects a selected substitute Candidate before execution", () => {
  const program = createProgram();
  const graph = createImageGraph(program);
  assert.throws(
    () => start(program, graph, request(graph, ["media"], [choose("media", "black")], "exact")),
    /selects a substitute path/u,
  );
});
