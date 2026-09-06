import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
  verifyRecordStructure,
} from "@hypit/core";
import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
} from "@hypit/driver-node";
import type {
  CapabilityRef,
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import {
  TypeValidationError,
  TypeValidatorRegistry,
  admitRecord,
  validateValue,
} from "@hypit/validation";

const contractModule = { name: "example.measurement-contract", version: "1.0.0" } as const;
const sensorModule = { name: "example.sensor", version: "1.0.0" } as const;
const reportModule = { name: "example.report", version: "1.0.0" } as const;

const measurementType = { module: contractModule, name: "Measurement" } satisfies TypeRef;
const reportType = { module: reportModule, name: "Report" } satisfies TypeRef;
const measurementCapability = {
  module: sensorModule,
  name: "obtain-measurement",
} satisfies CapabilityRef;
const measureProducer = { module: sensorModule, name: "measure" } satisfies ProducerRef;
const requestProducer = { module: sensorModule, name: "request-measurement" } satisfies ProducerRef;
const reportProducer = { module: reportModule, name: "write-report" } satisfies ProducerRef;

const contractManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: contractModule.name,
  version: contractModule.version,
  dependencies: [],
  types: [{
    name: measurementType.name,
  }],
  capabilities: [],
  producers: [],
};

const contractDependency = {
  module: contractModule,
};

const sensorManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: sensorModule.name,
  version: sensorModule.version,
  dependencies: [contractDependency],
  types: [],
  capabilities: [{ name: measurementCapability.name, returns: measurementType }],
  producers: [
    {
      name: measureProducer.name,
      inputs: [],
      outputs: [{ name: "measurement", type: measurementType }],
      needs: [],
    },
    {
      name: requestProducer.name,
      inputs: [],
      outputs: [],
      needs: [{
        name: "measurement",
        capability: measurementCapability,
        returns: measurementType,
      }],
    },
  ],
};

const reportManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: reportModule.name,
  version: reportModule.version,
  dependencies: [contractDependency],
  types: [{ name: reportType.name }],
  capabilities: [],
  producers: [{
    name: reportProducer.name,
    inputs: [{ name: "measurement", type: measurementType }],
    outputs: [{ name: "report", type: reportType }],
    needs: [],
  }],
};

function registry(): TypeValidatorRegistry {
  const validators = new TypeValidatorRegistry();
  validators.register(measurementType, ({ value }) => {
    if (value.kind !== "inline" || value.value === null || Array.isArray(value.value)
      || typeof value.value !== "object") {
      throw new Error("measurement must be inline");
    }
    const measured = (value.value as Readonly<Record<string, unknown>>).value;
    if (typeof measured !== "number" || measured % 2 !== 0) {
      throw new Error("measurement must be even");
    }
  });
  return validators;
}

function program(): LinkedProgram {
  const closure = createResolvedClosure([contractManifest, sensorManifest, reportManifest]);
  return link(closure, []);
}

function outputGraph(): CompiledGraph {
  return sealCompiledGraph({
    outputs: [
      {
        id: "measurement",
        type: measurementType,
        primary: "measure",
      },
      {
        id: "report",
        type: reportType,
        primary: "report",
      },
    ],
    candidates: [
      {
        id: "measure",
        type: measurementType,
        root: { kind: "operation", result: { kind: "operation-result", operation: "measure" } },
      },
      {
        id: "report",
        type: reportType,
        root: { kind: "operation", result: { kind: "operation-result", operation: "report" } },
      },
    ],
    operations: [
      {
        id: "measure",
        producer: measureProducer,
        inputs: {},
        result: { kind: "output", name: "measurement", record: "measurement:root" },
      },
      {
        id: "report",
        producer: reportProducer,
        inputs: { measurement: { kind: "logical-output", id: "measurement" } },
        result: { kind: "output", name: "report", record: "report:root" },
      },
    ],
  });
}

function outputBuild(linked: LinkedProgram, graph = outputGraph()) {
  return start(linked, graph, sealBuildRequest({
    targets: [{ output: "report" }],
  }));
}

function hosts(measured: number): ProducerRegistry {
  const hosts = new ProducerRegistry();
  hosts.registerProducer(measureProducer, () => ({
    outputs: { measurement: { kind: "inline", value: { value: measured, unit: "ticks" } } },
    needs: {},
  }));
  hosts.registerProducer(reportProducer, ({ inputs }) => ({
    outputs: {
      report: {
        kind: "inline",
        value: `accepted:${JSON.stringify(inputs.measurement?.value)}`,
      },
    },
    needs: {},
  }));
  return hosts;
}

test("three independent packages communicate through an owner-validated nominal Type", async () => {
  const linked = program();
  const result = await new NodeDriver({
    producers: hosts(4),
    validators: registry(),
  }).run(outputBuild(linked));

  assert.equal(result.status, "complete");
  const measurement = result.state.records.find((record) => record.id === "measurement:root");
  assert.equal(measurement?.value.kind, "inline");
  assert.equal(result.state.records.find((record) => record.id === "report:root")?.type.name, "Report");

});

test("a structurally valid but semantically invalid Producer value never enters BuildState", async () => {
  const linked = program();
  const result = await new NodeDriver({
    producers: hosts(3),
    validators: registry(),
  }).run(outputBuild(linked));

  assert.equal(result.status, "failed");
  assert.match(result.outcomes[0]?.message ?? "", /measurement must be even/u);
  assert.equal(result.state.records.some((record) => record.id === "measurement:root"), false);
});

function providerGraph(): CompiledGraph {
  return sealCompiledGraph({
    outputs: [{
      id: "measurement",
      type: measurementType,
      primary: "request",
    }],
    candidates: [{
      id: "request",
      type: measurementType,
      root: { kind: "operation", result: { kind: "operation-result", operation: "request" } },
    }],
    operations: [{
      id: "request",
      producer: requestProducer,
      inputs: {},
      result: {
        kind: "need",
        name: "measurement",
        id: "need:measurement",
        record: "measurement:endpoint",
      },
    }],
  });
}

async function providerBuild(measured: number) {
  const linked = program();
  const graph = providerGraph();
  const hosts = new ProducerRegistry();
  hosts.registerProducer(requestProducer, () => ({
    outputs: {},
    needs: { measurement: { sample: "latest" } },
  }));
  const endpoints = new EndpointRegistry();
  endpoints.registerImmediateEndpoint(
    "example:measurement-endpoint",
    measurementCapability,
    measurementType,
    () => ({
      value: { kind: "inline", value: { value: measured, unit: "ticks" } },
    }),
  );
  return await new NodeDriver({ producers: hosts, endpoints, validators: registry() }).run(start(
    linked,
    graph,
    sealBuildRequest({
      targets: [{ output: "measurement" }],
    }),
  ));
}

test("Endpoint results pass the same Type-owner validation gate as Producer results", async () => {
  const valid = await providerBuild(8);
  assert.equal(valid.status, "complete");
  assert.equal(valid.state.records[0]?.value.kind, "inline");

  const invalid = await providerBuild(7);
  assert.equal(invalid.status, "failed");
  assert.match(invalid.outcomes.at(-1)?.message ?? "", /measurement must be even/u);
  assert.equal(invalid.state.records.some((record) => record.id === "measurement:endpoint"), false);
});

test("authored values cross the Type owner's validation gate without carrying validation metadata", async () => {
  const linked = program();
  const raw = sealRecord({
    id: "measurement:authored",
    type: measurementType,
    value: { kind: "inline", value: { value: 10, unit: "ticks" } },
  });
  verifyRecordStructure(linked.closure, raw);
  const admitted = await admitRecord(linked.closure, raw, registry());
  verifyRecordStructure(linked.closure, admitted);
  assert.deepEqual(admitted, raw);
});

test("Type validation errors remain machine distinguishable", async () => {
  await assert.rejects(
    () => validateValue(
      program().closure,
      measurementType,
      { kind: "inline", value: { value: 9, unit: "ticks" } },
      registry(),
    ),
    (error: unknown) => error instanceof TypeValidationError && error.code === "TYPE_REFINEMENT_REJECTED",
  );
});
