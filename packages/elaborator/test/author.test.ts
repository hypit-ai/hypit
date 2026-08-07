import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";
import {
  AuthorModuleError,
  elaborateAuthorModule,
  sealAuthorModule,
  sealGraphFragment,
} from "@svml/elaborator";
import type { GraphFragment } from "@svml/elaborator";
import type {
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";

const laboratory = { name: "example.laboratory", version: "1" } as const;
const sampleType = { module: laboratory, name: "Sample" } satisfies TypeRef;
const measurementType = { module: laboratory, name: "Measurement" } satisfies TypeRef;
const reportType = { module: laboratory, name: "Report" } satisfies TypeRef;
const measureProducer = { module: laboratory, name: "measure" } satisfies ProducerRef;
const reportProducer = { module: laboratory, name: "write-report" } satisfies ProducerRef;
const echoProducer = { module: laboratory, name: "echo-sample" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "svml.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [],
  types: [
    { name: sampleType.name, schema: { kind: "string", minLength: 1 } },
    { name: measurementType.name, schema: { kind: "number" } },
    { name: reportType.name, schema: { kind: "string", minLength: 1 } },
  ],
  capabilities: [],
  surfaces: [],
  producers: [
    {
      name: measureProducer.name,
      inputs: [{ name: "sample", type: sampleType }],
      outputs: [{ name: "measurement", type: measurementType }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.laboratory/measure",
        digest: digestOf("example.laboratory/measure@1"),
      },
    },
    {
      name: reportProducer.name,
      inputs: [{ name: "measurement", type: measurementType }],
      outputs: [{ name: "report", type: reportType }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.laboratory/write-report",
        digest: digestOf("example.laboratory/write-report@1"),
      },
    },
    {
      name: echoProducer.name,
      inputs: [{ name: "sample", type: sampleType }],
      outputs: [{ name: "sample", type: sampleType }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.laboratory/echo-sample",
        digest: digestOf("example.laboratory/echo-sample@1"),
      },
    },
  ],
};

const closure = createResolvedClosure([manifest]);

function program(): LinkedProgram {
  const origin = {
    kind: "authored" as const,
    sourceDigest: digestOf("source:laboratory"),
    frontendClosureDigest: digestOf("frontend:none"),
  };
  return link(closure, [sealTypedModule({
    id: "laboratory-inputs",
    closureDigest: closure.digest,
    records: [sealRecord({
      id: "sample:soil",
      type: sampleType,
      value: { kind: "inline", value: "soil" },
      conformance: "exact",
      origin,
    })],
  })]);
}

function singleOperationFragment(
  name: string,
  inputName: string,
  inputType: TypeRef,
  producer: ProducerRef,
  resultName: string,
  resultType: TypeRef,
): GraphFragment {
  return sealGraphFragment({
    name,
    inputs: [{ name: inputName, type: inputType }],
    operations: [{
      id: "produce",
      producer,
      inputs: { [inputName]: { kind: "fragment-input", name: inputName } },
      result: { kind: "output", name: resultName },
    }],
    exports: [{
      name: "result",
      type: resultType,
      root: { kind: "fragment-operation", operation: "produce" },
      semanticInputs: [inputName],
      fidelity: "exact",
    }],
  });
}

const measureFragment = singleOperationFragment(
  "measure-sample",
  "sample",
  sampleType,
  measureProducer,
  "measurement",
  measurementType,
);
const reportFragment = singleOperationFragment(
  "write-report",
  "measurement",
  measurementType,
  reportProducer,
  "report",
  reportType,
);
const echoFragment = singleOperationFragment(
  "echo-sample",
  "sample",
  sampleType,
  echoProducer,
  "sample",
  sampleType,
);
const fragments = new Map([
  [measureFragment.id, measureFragment],
  [reportFragment.id, reportFragment],
  [echoFragment.id, echoFragment],
]);

test("Author linking resolves forward component references without Text or video contracts", () => {
  const linked = program();
  const author = sealAuthorModule({
    name: "soil-analysis",
    components: [
      {
        id: "final-report",
        fragment: reportFragment.id,
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
        fragment: measureFragment.id,
        inputs: { sample: { kind: "record", id: "sample:soil" } },
        outputs: { result: "measurement:soil" },
      },
    ],
  });

  const elaborated = elaborateAuthorModule(linked, author, (id) => fragments.get(id));
  assert.equal(elaborated.graph.outputs.length, 2);
  assert.deepEqual(
    elaborated.graph.outputs.map((output) => output.id),
    ["measurement:soil", "report:final"],
  );
  const reportOperation = elaborated.graph.operations.find((operation) =>
    operation.producer.name === reportProducer.name);
  assert.deepEqual(reportOperation?.inputs.measurement, {
    kind: "logical-output",
    id: "measurement:soil",
  });

  const request = sealBuildRequest({
    graph: elaborated.graph.id,
    targets: [{ output: "report:final", accepts: "exact" }],
    satisfactions: [],
  });
  const state = start(linked, elaborated.graph, request);
  assert.deepEqual(
    state.plan.steps.map((step) => step.producer.name).sort(),
    [measureProducer.name, reportProducer.name].sort(),
  );
  const measurementStep = state.plan.steps.find((step) => step.producer.name === measureProducer.name);
  const reportStep = state.plan.steps.find((step) => step.producer.name === reportProducer.name);
  assert.equal(reportStep?.inputs.measurement, measurementStep?.outputs.measurement);
});

test("Author linking rejects cycles before producing a Core graph", () => {
  const author = sealAuthorModule({
    name: "cyclic-laboratory",
    components: [
      {
        id: "left",
        fragment: echoFragment.id,
        inputs: {
          sample: { kind: "component-output", component: "right", output: "result" },
        },
        outputs: { result: "sample:left" },
      },
      {
        id: "right",
        fragment: echoFragment.id,
        inputs: {
          sample: { kind: "component-output", component: "left", output: "result" },
        },
        outputs: { result: "sample:right" },
      },
    ],
  });
  assert.throws(
    () => elaborateAuthorModule(program(), author, (id) => fragments.get(id)),
    (error: unknown) => error instanceof AuthorModuleError && error.code === "AUTHOR_COMPONENT_CYCLE",
  );
});

test("Author linking checks symbolic input types before Graph verification", () => {
  const author = sealAuthorModule({
    name: "invalid-laboratory",
    components: [{
      id: "final-report",
      fragment: reportFragment.id,
      inputs: { measurement: { kind: "record", id: "sample:soil" } },
      outputs: { result: "report:invalid" },
    }],
  });
  assert.throws(
    () => elaborateAuthorModule(program(), author, (id) => fragments.get(id)),
    (error: unknown) => error instanceof AuthorModuleError && error.code === "AUTHOR_INPUT_TYPE_MISMATCH",
  );
});
