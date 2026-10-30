import assert from "node:assert/strict";
import test from "node:test";

// Kernel owns fixed-graph finite-plan demand.
import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import type {
  AuthorGraph,
  GraphValueRef,
  LinkedProgram,
  LogicalOutput,
  ModuleManifest,
  OperationNode,
  OperationResultRef,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";

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
    types.head.name,
    types.duration.name,
    types.image.name,
    types.imageSet.name,
    types.product.name,
    ...[types.a, types.b, types.c, types.d, types.combined].map((type) => type.name),
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

const recordRef = (id: string) => ({ kind: "record" as const, id });
const outputRef = (id: string): GraphValueRef => ({ kind: "logical-output", id });
const operationRef = (operation: string): OperationResultRef => ({ kind: "operation-result", operation });

function output(
  id: string,
  type: TypeRef,
  operation: string,
): LogicalOutput {
  return { id, type, result: operationRef(operation) };
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
    { id: "authored:image1", type: types.image, value: "I1" },
    { id: "authored:image2", type: types.image, value: "I2" },
    { id: "authored:image3", type: types.image, value: "I3" },
    { id: "authored:media", type: types.image, value: "AUTHORED MEDIA" },
    { id: "authored:A", type: types.a, value: "A" },
    { id: "authored:B", type: types.b, value: "B" },
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

function start(
  program: LinkedProgram,
  graph: AuthorGraph,
  targets: readonly string[],
): BuildView {
  const planned = planBuild(program, graph, targets);
  return materializeBuild(defineBuild({
    program,
    plan: planned.plan,
  }), []);
}

function fixture(targets: readonly string[]): BuildView {
  const program = createProgram();
  const graph = createImageGraph();
  return start(program, graph, targets);
}

function stepIds(state: BuildView): string[] {
  return state.plan.steps.map((step) => step.id).sort();
}

test("Targets derive the exact fixed image closure", () => {
  const cases: readonly [string, readonly string[]][] = [
    ["image3", ["p1", "p2", "p3"]],
    ["image2", ["p1", "p2"]],
    ["image1", ["p1"]],
  ];
  for (const [target, expected] of cases) {
    assert.deepEqual(stepIds(fixture([target])), expected);
  }
});
test("an ordinary aggregator intentionally demands every authored image", () => {
  assert.deepEqual(stepIds(fixture(["images"])), ["collect", "p1", "p2", "p3"]);
});

test("multiple Targets share Operations once", () => {
  const first = fixture(["image3", "image2"]);
  assert.deepEqual(stepIds(first), ["p1", "p2", "p3"]);
  assert.equal(new Set(first.plan.steps.map((step) => step.id)).size, first.plan.steps.length);
});

test("the authored output result determines demanded upstream inputs", () => {
  assert.deepEqual(stepIds(fixture(["media"])), ["p1", "p2", "seedance"]);
});

test("Definition replay regenerates identical ready Commands", () => {
  const state = fixture(["image3"]);
  const definition = defineBuild({ program: state.program, plan: state.plan });
  const restored = materializeBuild(
    JSON.parse(JSON.stringify(definition)) as typeof definition,
    [],
  );
  assert.deepEqual(restored.outstanding, state.outstanding);
});

function createCaseGGraph(): AuthorGraph {
  return sealAuthorGraph({
    outputs: [
      output("a.A", types.a, "a1"),
      output("a.B", types.b, "a2"),
      output("b.C", types.c, "b1"),
      output("b.D", types.d, "b2"),
      output("c.result", types.combined, "c"),
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

test("Case G: shared zero-input upstream Operations appear exactly once", () => {
  const program = createProgram();
  const graph = createCaseGGraph();
  const state = start(program, graph, ["c.result"]);
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
      output("left", types.image, "left-operation"),
      output("right", types.image, mode === "shared" ? "left-operation" : "right-operation"),
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

test("two outputs that name one OperationId demand exactly one execution", () => {
  const program = createProgram();
  const graph = createOperationIdentityGraph("shared");
  const planned = planBuild(program, graph, ["left", "right"]);
  const state = start(program, graph, ["left", "right"]);
  assert.deepEqual(stepIds(state), ["left-operation"]);
  assert.deepEqual(
    planned.outputs.map((output) => [output.output, output.record]),
    [["left", "identity:left"], ["right", "identity:left"]],
  );
});

test("different OperationIds remain distinct when their definitions match", () => {
  const program = createProgram();
  const graph = createOperationIdentityGraph("distinct");
  const state = start(program, graph, ["left", "right"]);
  assert.deepEqual(stepIds(state), ["left-operation", "right-operation"]);
  assert.deepEqual(
    state.plan.steps.map((step) => step.producer),
    [producers.p1, producers.p1],
    "same Producer and same inputs still represent two author-declared operations",
  );
});
