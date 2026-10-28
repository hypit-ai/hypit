import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import {
  AuthorGraphError,
  elaborateAuthorGraph,
  sealGraphFragment,
} from "@hypit/author";
import type { AuthorComponent, GraphFragment } from "@hypit/author";
import type {
  AuthorGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";

const laboratory = { name: "example.laboratory", version: "1" } as const;
const sampleType = { module: laboratory, name: "Sample" } satisfies TypeRef;
const measurementType = { module: laboratory, name: "Measurement" } satisfies TypeRef;
const reportType = { module: laboratory, name: "Report" } satisfies TypeRef;
const measureProducer = { module: laboratory, name: "measure" } satisfies ProducerRef;
const reportProducer = { module: laboratory, name: "write-report" } satisfies ProducerRef;
const echoProducer = { module: laboratory, name: "echo-sample" } satisfies ProducerRef;
const protoProducer = { module: laboratory, name: "echo-prototype-slot" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [],
  types: [
    sampleType.name,
    measurementType.name,
    reportType.name,
  ],
  capabilities: [],
  producers: [
    {
      name: measureProducer.name,
      inputs: [{ name: "sample", type: sampleType }],
      result: { kind: "output" as const, name: "measurement", type: measurementType },
    },
    {
      name: reportProducer.name,
      inputs: [{ name: "measurement", type: measurementType }],
      result: { kind: "output" as const, name: "report", type: reportType },
    },
    {
      name: echoProducer.name,
      inputs: [{ name: "sample", type: sampleType }],
      result: { kind: "output" as const, name: "sample", type: sampleType },
    },
    {
      name: protoProducer.name,
      inputs: [{ name: "__proto__", type: sampleType }],
      result: { kind: "output" as const, name: "sample", type: sampleType },
    },
  ],
};

const closure = createResolvedClosure([manifest]);

function buildState(linked: LinkedProgram, graph: AuthorGraph, targets: readonly string[]) {
  const planned = planBuild(linked, graph, {
    format: "hypit.run-graph@1",
    records: [],
    candidates: [],
    operations: [],
    satisfactions: [],
    targets,
  });
  return materializeBuild(defineBuild({
    program: link(linked.closure, [...linked.records, ...planned.initialRecords]),
    plan: planned.plan,
  }), []);
}

function program(): LinkedProgram {
  return link(closure, [{
      id: "sample:soil",
      type: sampleType,
      value: ("soil"),
  }]);
}

function singleOperationFragment(
  inputName: string,
  inputType: TypeRef,
  producer: ProducerRef,
  resultName: string,
  resultType: TypeRef,
): GraphFragment {
  return sealGraphFragment({
    inputs: [{ name: inputName, type: inputType }],
    operations: [{
      id: "produce",
      producer,
      inputs: { [inputName]: { kind: "fragment-input", name: inputName } },
      result: { kind: "output" as const, name: resultName },
    }],
    exports: [{
      name: "result",
      type: resultType,
      root: { kind: "fragment-operation", operation: "produce" },
    }],
  });
}

const measureFragment = singleOperationFragment(
  "sample",
  sampleType,
  measureProducer,
  "measurement",
  measurementType,
);
const reportFragment = singleOperationFragment(
  "measurement",
  measurementType,
  reportProducer,
  "report",
  reportType,
);
const echoFragment = singleOperationFragment(
  "sample",
  sampleType,
  echoProducer,
  "sample",
  sampleType,
);
test("Author linking resolves forward component references without Text or video contracts", () => {
  const linked = program();
  const components = [
      {
        id: "final-report",
        fragment: reportFragment,
        inputs: {
          measurement: {
            kind: "component-output",
            component: "measurement",
            output: "result",
          },
        },
        outputs: { result: "report:final" },
      },
      {
        id: "measurement",
        fragment: measureFragment,
        inputs: { sample: { kind: "record", id: "sample:soil" } },
        outputs: { result: "measurement:soil" },
      },
  ] satisfies readonly AuthorComponent[];

  const elaborated = elaborateAuthorGraph(linked, components);
  assert.equal(elaborated.outputs.length, 2);
  assert.deepEqual(
    elaborated.outputs.map((output) => output.id),
    ["measurement:soil", "report:final"],
  );
  const reportOperation = elaborated.operations.find((operation) =>
    operation.producer.name === reportProducer.name);
  assert.deepEqual(reportOperation?.inputs.measurement, {
    kind: "logical-output",
    id: "measurement:soil",
  });

  const state = buildState(linked, elaborated, ["report:final"]);
  assert.deepEqual(
    state.plan.steps.map((step) => step.producer.name).sort(),
    [measureProducer.name, reportProducer.name].sort(),
  );
  const measurementStep = state.plan.steps.find((step) => step.producer.name === measureProducer.name);
  const reportStep = state.plan.steps.find((step) => step.producer.name === reportProducer.name);
  assert.equal(reportStep?.inputs.measurement, measurementStep?.result.record);
});

test("Author linking rejects cycles before producing a Core graph", () => {
  const components = [
      {
        id: "left",
        fragment: echoFragment,
        inputs: {
          sample: { kind: "component-output", component: "right", output: "result" },
        },
        outputs: { result: "sample:left" },
      },
      {
        id: "right",
        fragment: echoFragment,
        inputs: {
          sample: { kind: "component-output", component: "left", output: "result" },
        },
        outputs: { result: "sample:right" },
      },
  ] satisfies readonly AuthorComponent[];
  assert.throws(
    () => elaborateAuthorGraph(program(), components),
    (error: unknown) => error instanceof AuthorGraphError && error.code === "AUTHOR_COMPONENT_CYCLE",
  );
});

test("Author linking checks symbolic input types before Graph verification", () => {
  const components = [{
      id: "final-report",
      fragment: reportFragment,
      inputs: { measurement: { kind: "record", id: "sample:soil" } },
      outputs: { result: "report:invalid" },
  }] satisfies readonly AuthorComponent[];
  assert.throws(
    () => elaborateAuthorGraph(program(), components),
    (error: unknown) => error instanceof AuthorGraphError && error.code === "AUTHOR_INPUT_TYPE_MISMATCH",
  );
});

test("Author linking preserves prototype-looking input names as graph data", () => {
  const fragment = singleOperationFragment(
    "__proto__",
    sampleType,
    protoProducer,
    "sample",
    sampleType,
  );
  const inputs = Object.fromEntries([["__proto__", { kind: "record", id: "sample:soil" }]]) as AuthorComponent["inputs"];
  const elaborated = elaborateAuthorGraph(program(), [{
    id: "prototype-input",
    fragment,
    inputs,
    outputs: { result: "sample:prototype" },
  }]);

  const operation = elaborated.operations.find((item) => item.producer.name === protoProducer.name);
  assert.equal(Object.hasOwn(operation?.inputs ?? {}, "__proto__"), true);
  assert.deepEqual(operation?.inputs.__proto__, { kind: "record", id: "sample:soil" });
});
