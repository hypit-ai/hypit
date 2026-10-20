import assert from "node:assert/strict";
import test from "node:test";

// Kernel owns structural selection and finite-plan demand.
import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import type {
  BuildState,
  Candidate,
  CanonicalValue,
  AuthorGraph,
  GraphValueRef,
  LinkedProgram,
  LogicalOutput,
  ModuleManifest,
  OperationNode,
  OperationResultRef,
  ProducerRef,
  Satisfaction,
  TypeRef,
} from "@hypit/protocol";

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
  product: { module: moduleRef, name: "Product" },
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
  makeProduct: producer("make-product"),
  projectC: producer("project-c"),
  projectD: producer("project-d"),
  c: producer("c"),
};
const seedanceCapability = { module: moduleRef, name: "seedance-media" } as const;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    { name: types.head.name },
    { name: types.duration.name },
    { name: types.image.name },
    { name: types.imageSet.name },
    {
      name: types.product.name,
    },
    ...[types.a, types.b, types.c, types.d, types.combined].map((type) => ({
      name: type.name,
    })),
  ],
  capabilities: [{ name: seedanceCapability.name, returns: types.image }],
  producers: [
    {
      name: producers.p1.name,
      inputs: [{ name: "head", type: types.head }],
      result: { kind: "output" as const, name: "image", type: types.image },
    },
    {
      name: producers.p2.name,
      inputs: [{ name: "head", type: types.head }, { name: "image1", type: types.image }],
      result: { kind: "output" as const, name: "image", type: types.image },
    },
    {
      name: producers.p3.name,
      inputs: [
        { name: "head", type: types.head },
        { name: "image1", type: types.image },
        { name: "image2", type: types.image },
      ],
      result: { kind: "output" as const, name: "image", type: types.image },
    },
    {
      name: producers.collect.name,
      inputs: [
        { name: "image1", type: types.image },
        { name: "image2", type: types.image },
        { name: "image3", type: types.image },
      ],
      result: { kind: "output" as const, name: "images", type: types.imageSet },
    },
    {
      name: producers.seedance.name,
      inputs: [
        { name: "head", type: types.head },
        { name: "duration", type: types.duration },
        { name: "reference1", type: types.image },
        { name: "reference2", type: types.image },
      ],
      result: { kind: "need" as const, name: "media", capability: seedanceCapability },
    },
    {
      name: producers.black.name,
      inputs: [{ name: "duration", type: types.duration }],
      result: { kind: "output" as const, name: "media", type: types.image },
    },
    ...[
      [producers.a1, "value", types.a],
      [producers.a2, "value", types.b],
    ].map(([ref, name, type]) => ({
      name: (ref as ProducerRef).name,
      inputs: [],
      result: { kind: "output" as const, name: name as string, type: type as TypeRef },
    })),
    {
      name: producers.b1.name,
      inputs: [{ name: "A", type: types.a }, { name: "B", type: types.b }],
      result: { kind: "output" as const, name: "C", type: types.c },
    },
    {
      name: producers.b2.name,
      inputs: [{ name: "A", type: types.a }, { name: "B", type: types.b }],
      result: { kind: "output" as const, name: "D", type: types.d },
    },
    {
      name: producers.makeProduct.name,
      inputs: [{ name: "A", type: types.a }, { name: "B", type: types.b }],
      result: { kind: "output" as const, name: "product", type: types.product },
    },
    {
      name: producers.projectC.name,
      inputs: [{ name: "product", type: types.product }],
      result: { kind: "output" as const, name: "C", type: types.c },
    },
    {
      name: producers.projectD.name,
      inputs: [{ name: "product", type: types.product }],
      result: { kind: "output" as const, name: "D", type: types.d },
    },
    {
      name: producers.c.name,
      inputs: [{ name: "C", type: types.c }, { name: "D", type: types.d }],
      result: { kind: "output" as const, name: "combined", type: types.combined },
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
): LogicalOutput {
  return { id, type, primary };
}

function candidate(
  id: string,
  type: TypeRef,
  operation: string,
): Candidate {
  return { id, type, root: { kind: "operation", result: operationRef(operation) } };
}

function providedCandidate(
  id: string,
  type: TypeRef,
  record: string,
  value: CanonicalValue,
): Candidate {
  return {
    id,
    type,
    root: { kind: "value", record, value },
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
    ({
      id: "head:root",
      type: types.head,
      value: ("reference"),
    }),
    ({
      id: "duration:root",
      type: types.duration,
      value: (3),
    }),
    ({
      id: "duration:other",
      type: types.duration,
      value: (9),
    }),
  ];
  return link(closure, authored);
}

function createImageGraph(): AuthorGraph {
  return sealAuthorGraph({
    outputs: [
      output("image1", types.image, "p1"),
      output("image2", types.image, "p2"),
      output("image3", types.image, "p3"),
      output("images", types.imageSet, "collect"),
      output("media", types.image, "seedance"),
    ],
    candidates: [
      candidate("p1", types.image, "p1"),
      candidate("p2", types.image, "p2"),
      candidate("p3", types.image, "p3"),
      candidate("collect", types.imageSet, "collect"),
      candidate("seedance", types.image, "seedance"),
      candidate("black", types.image, "black"),
      providedCandidate("existing-image1", types.image, "provided:image1", "I1"),
      providedCandidate("existing-image2", types.image, "provided:image2", "I2"),
      providedCandidate("existing-image3", types.image, "provided:image3", "I3"),
      providedCandidate("existing-media", types.image, "provided:media", "EXISTING MEDIA"),
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
      }, { kind: "need", name: "media", id: "need:seedance", record: "media:seedance" }),
      operation("black", producers.black, { duration: recordRef("duration:root") }, { kind: "output", name: "media", record: "media:black" }),
    ],
  });
}

function startSelected(
  program: LinkedProgram,
  graph: AuthorGraph,
  targets: readonly string[],
  satisfactions: readonly Satisfaction[] = [],
): BuildState {
  const planned = planBuild(program, graph, {
    format: "hypit.run-graph@1",
    records: [],
    candidates: [],
    operations: [],
    satisfactions,
    targets: targets.map((outputId) => ({ output: outputId })),
  });
  return materializeBuild(defineBuild({
    program: link(program.closure, [...program.records, ...planned.initialRecords]),
    plan: planned.plan,
  }), []);
}

function fixture(targets: readonly string[], satisfactions: readonly Satisfaction[] = []): BuildState {
  const program = createProgram();
  const graph = createImageGraph();
  return startSelected(program, graph, targets, satisfactions);
}

function choose(outputId: string, candidateId: string): Satisfaction {
  return { output: outputId, candidate: candidateId };
}

function stepIds(state: BuildState): string[] {
  return state.plan.steps.map((step) => step.id).sort();
}

test("Targets and Existing-Value Candidates derive the exact image closure", () => {
  const cases: readonly [string, readonly Satisfaction[], readonly string[]][] = [
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

test("multiple Targets share Operations once", () => {
  const first = fixture(["image3", "image2"]);
  assert.deepEqual(stepIds(first), ["p1", "p2", "p3"]);
  assert.equal(new Set(first.plan.steps.map((step) => step.id)).size, first.plan.steps.length);
});

test("the selected Candidate alone determines demanded upstream inputs", () => {
  assert.deepEqual(stepIds(fixture(["media"])), ["p1", "p2", "seedance"]);
  assert.deepEqual(stepIds(fixture(["media"], [choose("media", "black")])), ["black"]);
});

test("an Existing Value is a normal Candidate root and prevents the paid Need from existing", () => {
  const state = fixture(["media"], [choose("media", "existing-media")]);
  assert.deepEqual(stepIds(state), []);
  assert.equal(state.records.some((record) => record.id === "provided:media"), true);
  assert.equal(state.status, "complete");
  assert.equal(state.needs.length, 0);
  assert.deepEqual(state.outstanding, []);
});

test("Definition replay regenerates identical ready Commands", () => {
  const state = fixture(["image3"], [
    choose("image1", "existing-image1"),
    choose("image2", "existing-image2"),
  ]);
  const definition = defineBuild({ program: state.program, plan: state.plan });
  const restored = materializeBuild(
    JSON.parse(JSON.stringify(definition)) as typeof definition,
    [],
  );
  assert.deepEqual(restored.outstanding, state.outstanding);
});

function createCaseGGraph(roots: "value" | "operation"): AuthorGraph {
  const a1Id = roots === "value" ? "a1-value" : "a1-operation";
  const a2Id = roots === "value" ? "a2-value" : "a2-operation";
  return sealAuthorGraph({
    outputs: [
      output("a.A", types.a, a1Id),
      output("a.B", types.b, a2Id),
      output("b.C", types.c, "b1"),
      output("b.D", types.d, "b2"),
      output("c.result", types.combined, "c"),
    ],
    candidates: [
      roots === "value"
        ? providedCandidate(a1Id, types.a, "provided:A", "A")
        : candidate(a1Id, types.a, "a1"),
      roots === "value"
        ? providedCandidate(a2Id, types.b, "provided:B", "B")
        : candidate(a2Id, types.b, "a2"),
      candidate("b1", types.c, "b1"),
      candidate("b2", types.d, "b2"),
      candidate("c", types.combined, "c"),
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
  const graph = createCaseGGraph("value");
  const planned = planBuild(program, graph, { format: "hypit.run-graph@1", records: [], candidates: [], operations: [], satisfactions: [], targets: [{ output: "c.result" }] });
  const state = startSelected(program, graph, ["c.result"]);
  assert.deepEqual(stepIds(state), ["b1", "b2", "c"]);
  assert.equal(state.records.some((record) => record.id === "provided:A"), true);
  assert.equal(state.records.some((record) => record.id === "provided:B"), true);
  const b1 = state.plan.steps.find((step) => step.id === "b1");
  const b2 = state.plan.steps.find((step) => step.id === "b2");
  assert.deepEqual(b1?.inputs, { A: "provided:A", B: "provided:B" });
  assert.deepEqual(b2?.inputs, { A: "provided:A", B: "provided:B" });
  assert.equal(planned.selections.find((item) => item.output === "b.C")?.record, "operation:C");
  assert.equal(planned.selections.find((item) => item.output === "b.D")?.record, "operation:D");
});

test("Case G: shared zero-input upstream Operations appear exactly once", () => {
  const program = createProgram();
  const graph = createCaseGGraph("operation");
  const state = startSelected(program, graph, ["c.result"]);
  assert.deepEqual(stepIds(state), ["a1", "a2", "b1", "b2", "c"]);
  assert.equal(state.plan.steps.filter((step) => step.id === "a1").length, 1);
  assert.equal(state.plan.steps.filter((step) => step.id === "a2").length, 1);
  const b1 = state.plan.steps.find((step) => step.id === "b1");
  const b2 = state.plan.steps.find((step) => step.id === "b2");
  assert.deepEqual(b1?.inputs, { A: "operation:A", B: "operation:B" });
  assert.deepEqual(b2?.inputs, { A: "operation:A", B: "operation:B" });
});

function createOperationIdentityGraph(
  mode: "shared" | "distinct",
): AuthorGraph {
  return sealAuthorGraph({
    outputs: [
      output("left", types.image, "left-candidate"),
      output("right", types.image, "right-candidate"),
    ],
    candidates: [
      candidate("left-candidate", types.image, "left-operation"),
      candidate("shared-candidate", types.image, "left-operation"),
      candidate(
        "right-candidate",
        types.image,
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
  const graph = createOperationIdentityGraph("shared");
  const planned = planBuild(program, graph, { format: "hypit.run-graph@1", records: [], candidates: [], operations: [], satisfactions: [], targets: [{ output: "left" }, { output: "right" }] });
  const state = startSelected(program, graph, ["left", "right"]);
  assert.deepEqual(stepIds(state), ["left-operation"]);
  assert.deepEqual(
    planned.selections.map((selection) => [selection.output, selection.record]),
    [["left", "identity:left"], ["right", "identity:left"]],
  );
});

test("one independent Candidate may explicitly satisfy multiple compatible Logical Outputs", () => {
  const program = createProgram();
  const graph = createOperationIdentityGraph("shared");
  const satisfactions = [
    { output: "left", candidate: "shared-candidate" },
    { output: "right", candidate: "shared-candidate" },
  ];
  const planned = planBuild(program, graph, { format: "hypit.run-graph@1", records: [], candidates: [], operations: [], satisfactions, targets: [{ output: "left" }, { output: "right" }] });
  const state = startSelected(program, graph, ["left", "right"], satisfactions);
  assert.deepEqual(stepIds(state), ["left-operation"]);
  assert.deepEqual(
    planned.selections.map((selection) => [selection.output, selection.record]),
    [["left", "identity:left"], ["right", "identity:left"]],
  );
});

test("different OperationIds are never content-deduplicated", () => {
  const program = createProgram();
  const graph = createOperationIdentityGraph("distinct");
  const state = startSelected(program, graph, ["left", "right"]);
  assert.deepEqual(stepIds(state), ["left-operation", "right-operation"]);
  assert.deepEqual(
    state.plan.steps.map((step) => step.producer),
    [producers.p1, producers.p1],
    "same Producer and same inputs still represent two author-declared operations",
  );
});

function createProductReplacementGraph(
  alternate: "shared" | "distinct",
): AuthorGraph {
  const productOperation = (
    id: string,
    record: string,
  ): OperationNode => operation(
    id,
    producers.makeProduct,
    { A: outputRef("a.A"), B: outputRef("a.B") },
    { kind: "output", name: "product", record },
  );
  const projection = (
    id: string,
    producerRef: ProducerRef,
    product: string,
    name: "C" | "D",
    record: string,
  ): OperationNode => operation(
    id,
    producerRef,
    { product: operationRef(product) },
    { kind: "output", name, record },
  );
  const altCProduct = "b.alt.product.c";
  const altDProduct = alternate === "shared" ? altCProduct : "b.alt.product.d";
  return sealAuthorGraph({
    outputs: [
      output("a.A", types.a, "a.A.primary"),
      output("a.B", types.b, "a.B.primary"),
      output("b.C", types.c, "b.C.primary"),
      output("b.D", types.d, "b.D.primary"),
      output("c.result", types.combined, "c.primary"),
    ],
    candidates: [
      candidate("a.A.primary", types.a, "a1"),
      candidate("a.B.primary", types.b, "a2"),
      candidate("b.C.primary", types.c, "b.default.C"),
      candidate("b.D.primary", types.d, "b.default.D"),
      candidate("b.C.alternate", types.c, "b.alt.C"),
      candidate("b.D.alternate", types.d, "b.alt.D"),
      candidate("c.primary", types.combined, "c"),
    ],
    operations: [
      operation("a1", producers.a1, {}, { kind: "output", name: "value", record: "product:A" }),
      operation("a2", producers.a2, {}, { kind: "output", name: "value", record: "product:B" }),
      productOperation("b.default.product", "product:default"),
      projection("b.default.C", producers.projectC, "b.default.product", "C", "product:default:C"),
      projection("b.default.D", producers.projectD, "b.default.product", "D", "product:default:D"),
      productOperation(altCProduct, "product:alternate:C"),
      ...(alternate === "distinct" ? [productOperation(altDProduct, "product:alternate:D")] : []),
      projection("b.alt.C", producers.projectC, altCProduct, "C", "product:alternate:C:projection"),
      projection("b.alt.D", producers.projectD, altDProduct, "D", "product:alternate:D:projection"),
      operation("c", producers.c, { C: outputRef("b.C"), D: outputRef("b.D") }, {
        kind: "output",
        name: "combined",
        record: "product:combined",
      }),
    ],
  });
}

const select = (outputId: string, candidateId: string): Satisfaction => ({
  output: outputId,
  candidate: candidateId,
});

test("one Run-Graph instance satisfies two Logical Outputs through one shared Product", () => {
  const program = createProgram();
  const graph = createProductReplacementGraph("shared");
  const state = startSelected(program, graph, ["c.result"], [
    select("b.C", "b.C.alternate"),
    select("b.D", "b.D.alternate"),
  ]);
  assert.deepEqual(stepIds(state), ["a1", "a2", "b.alt.C", "b.alt.D", "b.alt.product.c", "c"]);
  assert.equal(state.plan.steps.filter((step) => step.producer.name === producers.makeProduct.name).length, 1);
  assert.equal(state.plan.steps.some((step) => step.id.startsWith("b.default")), false);
});

test("two explicit Run-Graph instances may separately satisfy the two outputs", () => {
  const program = createProgram();
  const graph = createProductReplacementGraph("distinct");
  const state = startSelected(program, graph, ["c.result"], [
    select("b.C", "b.C.alternate"),
    select("b.D", "b.D.alternate"),
  ]);
  assert.deepEqual(stepIds(state), [
    "a1", "a2", "b.alt.C", "b.alt.D", "b.alt.product.c", "b.alt.product.d", "c",
  ]);
  assert.equal(state.plan.steps.filter((step) => step.producer.name === producers.makeProduct.name).length, 2);
  assert.equal(state.plan.steps.some((step) => step.id.startsWith("b.default")), false);
});

test("partial satisfaction keeps only the demanded projection of the default Product", () => {
  const program = createProgram();
  const graph = createProductReplacementGraph("shared");
  const state = startSelected(program, graph, ["c.result"], [
    select("b.C", "b.C.alternate"),
  ]);
  assert.deepEqual(stepIds(state), [
    "a1", "a2", "b.alt.C", "b.alt.product.c", "b.default.D", "b.default.product", "c",
  ]);
  assert.equal(state.plan.steps.some((step) => step.id === "b.default.C"), false);
});

test("an unbound sibling output cannot keep an unreachable default Product alive", () => {
  const program = createProgram();
  const graph = createProductReplacementGraph("shared");
  const state = startSelected(program, graph, ["b.C"], [
    select("b.C", "b.C.alternate"),
  ]);
  assert.deepEqual(stepIds(state), ["a1", "a2", "b.alt.C", "b.alt.product.c"]);
  assert.equal(state.plan.steps.some((step) => step.id.startsWith("b.default")), false);
});
