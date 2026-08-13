import assert from "node:assert/strict";
import test from "node:test";

import {
  computeModuleDigest,
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
  verifyRecord,
} from "@narratage/core";
import {
  ProducerRegistry,
  NodeDriver,
  EndpointRegistry,
  parseBuildState,
  serializeBuildState,
} from "@narratage/driver-node";
import type {
  CapabilityRef,
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";
import { parseModuleManifestText } from "@narratage/protocol";
import {
  TypeValidationError,
  TypeValidatorRegistry,
  admitRecord,
  validateValue,
} from "@narratage/validation";

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

const validatorDigest = digestOf("example.measurement-contract/even-integer-validator@1");
const producerDigests = {
  measure: digestOf("example.sensor/measure@1"),
  request: digestOf("example.sensor/request-measurement@1"),
  report: digestOf("example.report/write-report@1"),
};

const contractManifest: ModuleManifest = {
  format: "svml.module@1",
  name: contractModule.name,
  version: contractModule.version,
  dependencies: [],
  types: [{
    name: measurementType.name,
    schema: {
      kind: "object",
      fields: {
        value: { schema: { kind: "number", integer: true } },
        unit: { schema: { kind: "literal", value: "ticks" } },
      },
    },
    validator: {
      implementation: {
        digest: validatorDigest,
      },
    },
  }],
  capabilities: [],
  producers: [],
};

const contractDependency = {
  module: contractModule,
  digest: computeModuleDigest(contractManifest),
};

const sensorManifest: ModuleManifest = {
  format: "svml.module@1",
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
      implementation: {
        digest: producerDigests.measure,
      },
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
      implementation: {
        digest: producerDigests.request,
      },
    },
  ],
};

const reportManifest: ModuleManifest = {
  format: "svml.module@1",
  name: reportModule.name,
  version: reportModule.version,
  dependencies: [contractDependency],
  types: [{ name: reportType.name, schema: { kind: "string", minLength: 1 } }],
  capabilities: [],
  producers: [{
    name: reportProducer.name,
    inputs: [{ name: "measurement", type: measurementType }],
    outputs: [{ name: "report", type: reportType }],
    needs: [],
    implementation: {
      digest: producerDigests.report,
    },
  }],
};

function registry(digest = validatorDigest): TypeValidatorRegistry {
  const validators = new TypeValidatorRegistry();
  validators.register(measurementType, digest, ({ value }) => {
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

function outputGraph(linked: LinkedProgram): CompiledGraph {
  return sealCompiledGraph({
    program: linked.semanticDigest,
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

function outputBuild(linked: LinkedProgram, graph = outputGraph(linked)) {
  return start(linked, graph, sealBuildRequest({
    graph: graph.id,
    targets: [{ output: "report" }],
  }));
}

function hosts(measured: number): ProducerRegistry {
  const hosts = new ProducerRegistry();
  hosts.registerProducer(measureProducer, producerDigests.measure, () => ({
    outputs: { measurement: { kind: "inline", value: { value: measured, unit: "ticks" } } },
    needs: {},
  }));
  hosts.registerProducer(reportProducer, producerDigests.report, ({ inputs }) => ({
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

  const restored = parseBuildState(serializeBuildState(result.state));
  assert.equal(restored.records.find((record) => record.id === "measurement:root")?.digest, measurement?.digest);
});

test("a structurally valid but semantically invalid Producer value never enters BuildState", async () => {
  const linked = program();
  const result = await new NodeDriver({
    producers: hosts(3),
    validators: registry(),
  }).run(outputBuild(linked));

  assert.equal(result.status, "paused");
  assert.match(result.outcomes[0]?.message ?? "", /measurement must be even/u);
  assert.equal(result.state.records.some((record) => record.id === "measurement:root"), false);
  assert.equal(result.state.acceptedEvents.length, 0);
});

test("missing or digest-mismatched validator implementations fail before record admission", async () => {
  const linked = program();
  const missing = await new NodeDriver({
    producers: hosts(4),
    validators: new TypeValidatorRegistry(),
  }).run(outputBuild(linked));
  assert.equal(missing.status, "paused");
  assert.match(missing.outcomes[0]?.message ?? "", /validator is not registered/u);

  const mismatched = await new NodeDriver({
    producers: hosts(4),
    validators: registry(digestOf("wrong-validator")),
  }).run(outputBuild(linked));
  assert.equal(mismatched.status, "paused");
  assert.match(mismatched.outcomes[0]?.message ?? "", /does not match the locked Manifest/u);
});

function providerGraph(linked: LinkedProgram): CompiledGraph {
  return sealCompiledGraph({
    program: linked.semanticDigest,
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
  const graph = providerGraph(linked);
  const hosts = new ProducerRegistry();
  hosts.registerProducer(requestProducer, producerDigests.request, () => ({
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
      graph: graph.id,
      targets: [{ output: "measurement" }],
    }),
  ));
}

test("Endpoint results pass the same Type-owner validation gate as Producer results", async () => {
  const valid = await providerBuild(8);
  assert.equal(valid.status, "complete");
  assert.equal(valid.state.records[0]?.value.kind, "inline");

  const invalid = await providerBuild(7);
  assert.equal(invalid.status, "paused");
  assert.match(invalid.outcomes.at(-1)?.message ?? "", /measurement must be even/u);
  assert.equal(invalid.state.records.some((record) => record.id === "measurement:endpoint"), false);
});

test("authored values cross the Type owner's validation gate without carrying validation metadata", async () => {
  const linked = program();
  const raw = sealRecord({
    id: "measurement:authored",
    type: measurementType,
    value: { kind: "inline", value: { value: 10, unit: "ticks" } },
    origin: {
      kind: "authored",
    },
  });
  verifyRecord(linked.closure, raw);
  const admitted = await admitRecord(linked.closure, raw, registry());
  verifyRecord(linked.closure, admitted);
  assert.deepEqual(admitted, raw);
});

test("the static Manifest reader discovers validator declarations without executing them", () => {
  const parsed = parseModuleManifestText(JSON.stringify(contractManifest));
  assert.deepEqual(parsed.types[0]?.validator, contractManifest.types[0]?.validator);
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
