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
  sealTypedModule,
  start,
  verifyRecord,
} from "@svml/core";
import {
  HostRegistry,
  NodeDriver,
  ProviderRegistry,
  parseBuildState,
  parseModuleManifestText,
  serializeBuildState,
} from "@svml/driver-node";
import type {
  CapabilityRef,
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";
import {
  TypeValidationError,
  TypeValidatorRegistry,
  admitRecord,
  validateValue,
} from "@svml/validation";

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
  format: "svml.module@0",
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
      abi: "svml.type-validator@1",
      implementation: {
        kind: "registered",
        locator: "example.measurement-contract/even-integer-validator",
        digest: validatorDigest,
      },
    },
  }],
  capabilities: [],
  surfaces: [],
  producers: [],
};

const contractDependency = {
  module: contractModule,
  digest: computeModuleDigest(contractManifest),
};

const sensorManifest: ModuleManifest = {
  format: "svml.module@0",
  name: sensorModule.name,
  version: sensorModule.version,
  dependencies: [contractDependency],
  types: [],
  capabilities: [{ name: measurementCapability.name, returns: measurementType }],
  surfaces: [],
  producers: [
    {
      name: measureProducer.name,
      inputs: [],
      outputs: [{ name: "measurement", type: measurementType }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.sensor/measure",
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
        kind: "registered",
        locator: "example.sensor/request-measurement",
        digest: producerDigests.request,
      },
    },
  ],
};

const reportManifest: ModuleManifest = {
  format: "svml.module@0",
  name: reportModule.name,
  version: reportModule.version,
  dependencies: [contractDependency],
  types: [{ name: reportType.name, schema: { kind: "string", minLength: 1 } }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: reportProducer.name,
    inputs: [{ name: "measurement", type: measurementType }],
    outputs: [{ name: "report", type: reportType }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.report/write-report",
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
  return link(closure, [sealTypedModule({
    id: "author:empty",
    closureDigest: closure.digest,
    records: [],
  })]);
}

function outputGraph(linked: LinkedProgram): CompiledGraph {
  return sealCompiledGraph({
    program: linked.semanticDigest,
    outputs: [
      {
        id: "measurement",
        type: measurementType,
        primary: "measure",
        candidates: ["measure"],
        semanticInputs: [],
      },
      {
        id: "report",
        type: reportType,
        primary: "report",
        candidates: ["report"],
        semanticInputs: [{ kind: "logical-output", id: "measurement" }],
      },
    ],
    candidates: [
      {
        id: "measure",
        output: "measurement",
        root: { kind: "operation", result: { kind: "operation-result", operation: "measure" } },
        fidelity: "exact",
      },
      {
        id: "report",
        output: "report",
        root: { kind: "operation", result: { kind: "operation-result", operation: "report" } },
        fidelity: "exact",
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
    targets: [{ output: "report", accepts: "exact" }],
    bindings: [],
  }));
}

function hosts(measured: number): HostRegistry {
  const hosts = new HostRegistry();
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
    registry: hosts(4),
    validators: registry(),
  }).run(outputBuild(linked));

  assert.equal(result.status, "complete");
  const measurement = result.state.records.find((record) => record.id === "measurement:root");
  assert.equal(measurement?.validation?.validatorDigest, validatorDigest);
  assert.equal(measurement?.validation?.recordDigest, measurement?.digest);
  assert.equal(result.state.records.find((record) => record.id === "report:root")?.type.name, "Report");

  const restored = parseBuildState(serializeBuildState(result.state));
  assert.equal(
    restored.records.find((record) => record.id === "measurement:root")?.validation?.id,
    measurement?.validation?.id,
  );
});

test("a structurally valid but semantically invalid Producer value never enters BuildState", async () => {
  const linked = program();
  const result = await new NodeDriver({
    registry: hosts(3),
    validators: registry(),
  }).run(outputBuild(linked));

  assert.equal(result.status, "paused");
  assert.match(result.journal[0]?.message ?? "", /measurement must be even/u);
  assert.equal(result.state.records.some((record) => record.id === "measurement:root"), false);
  assert.equal(result.state.acceptedEvents.length, 0);
});

test("missing or digest-mismatched validator implementations fail before record admission", async () => {
  const linked = program();
  const missing = await new NodeDriver({
    registry: hosts(4),
    validators: new TypeValidatorRegistry(),
  }).run(outputBuild(linked));
  assert.equal(missing.status, "paused");
  assert.match(missing.journal[0]?.message ?? "", /validator is not registered/u);

  const mismatched = await new NodeDriver({
    registry: hosts(4),
    validators: registry(digestOf("wrong-validator")),
  }).run(outputBuild(linked));
  assert.equal(mismatched.status, "paused");
  assert.match(mismatched.journal[0]?.message ?? "", /does not match the locked Manifest/u);
});

function providerGraph(linked: LinkedProgram): CompiledGraph {
  return sealCompiledGraph({
    program: linked.semanticDigest,
    outputs: [{
      id: "measurement",
      type: measurementType,
      primary: "request",
      candidates: ["request"],
      semanticInputs: [],
    }],
    candidates: [{
      id: "request",
      output: "measurement",
      root: { kind: "operation", result: { kind: "operation-result", operation: "request" } },
      fidelity: "exact",
    }],
    operations: [{
      id: "request",
      producer: requestProducer,
      inputs: {},
      result: {
        kind: "need",
        name: "measurement",
        id: "need:measurement",
        record: "measurement:provider",
        accepts: "exact",
      },
    }],
  });
}

async function providerBuild(measured: number) {
  const linked = program();
  const graph = providerGraph(linked);
  const hosts = new HostRegistry();
  hosts.registerProducer(requestProducer, producerDigests.request, () => ({
    outputs: {},
    needs: { measurement: { sample: "latest" } },
  }));
  const providers = new ProviderRegistry();
  providers.registerProvider(
    "example:measurement-provider",
    measurementCapability,
    measurementType,
    () => ({
      value: { kind: "inline", value: { value: measured, unit: "ticks" } },
      conformance: "exact",
      delivery: "executed",
      metadata: {},
    }),
  );
  return await new NodeDriver({ registry: hosts, providers, validators: registry() }).run(start(
    linked,
    graph,
    sealBuildRequest({
      graph: graph.id,
      targets: [{ output: "measurement", accepts: "exact" }],
      bindings: [],
    }),
  ));
}

test("Provider results pass the same Type-owner validation gate as Producer results", async () => {
  const valid = await providerBuild(8);
  assert.equal(valid.status, "complete");
  assert.equal(valid.state.records[0]?.validation?.validatorDigest, validatorDigest);

  const invalid = await providerBuild(7);
  assert.equal(invalid.status, "paused");
  assert.match(invalid.journal.at(-1)?.message ?? "", /measurement must be even/u);
  assert.equal(invalid.state.records.some((record) => record.id === "measurement:provider"), false);
});

test("authored values require a receipt bound to their exact Type and content", async () => {
  const linked = program();
  const raw = sealRecord({
    id: "measurement:authored",
    type: measurementType,
    value: { kind: "inline", value: { value: 10, unit: "ticks" } },
    conformance: "exact",
    origin: {
      kind: "authored",
      sourceDigest: digestOf("measurement-source"),
      frontendClosureDigest: digestOf("measurement-frontend"),
    },
  });
  assert.throws(() => verifyRecord(linked.closure, raw), /requires .*validator/u);
  const admitted = await admitRecord(linked.closure, raw, registry());
  verifyRecord(linked.closure, admitted);
  assert.equal(admitted.validation?.recordDigest, admitted.digest);
});

test("the static Manifest reader discovers validator declarations without executing them", () => {
  const parsed = parseModuleManifestText(JSON.stringify(contractManifest));
  assert.deepEqual(parsed.types[0]?.validator, contractManifest.types[0]?.validator);
  assert.throws(
    () => parseModuleManifestText(JSON.stringify({
      ...contractManifest,
      types: [{
        ...contractManifest.types[0],
        validator: {
          ...contractManifest.types[0]?.validator,
          abi: "arbitrary-javascript@1",
        },
      }],
    })),
    /validator.*abi must be svml\.type-validator@1/u,
  );
});

test("the static Manifest reader preserves Producer and Need result affinity", () => {
  const outputAffinity = [{
    resultPointer: "/value",
    input: "basis",
    inputPointer: "/value",
  }];
  const needAffinity = [{
    resultPointer: "",
    input: "basis",
    inputPointer: "",
  }];
  const manifest: ModuleManifest = {
    ...sensorManifest,
    producers: [
      {
        ...sensorManifest.producers[0]!,
        inputs: [{ name: "basis", type: measurementType }],
        outputs: [{ name: "measurement", type: measurementType, affinity: outputAffinity }],
      },
      {
        ...sensorManifest.producers[1]!,
        inputs: [{ name: "basis", type: measurementType }],
        needs: [{
          name: "measurement",
          capability: measurementCapability,
          returns: measurementType,
          affinity: needAffinity,
        }],
      },
    ],
  };

  const parsed = parseModuleManifestText(JSON.stringify(manifest));
  assert.deepEqual(parsed, manifest);
  assert.deepEqual(parsed.producers[0]?.outputs[0]?.affinity, outputAffinity);
  assert.deepEqual(parsed.producers[1]?.needs[0]?.affinity, needAffinity);
  assert.doesNotThrow(() => createResolvedClosure([contractManifest, parsed]));
});

test("the static Manifest reader rejects incomplete result affinity", () => {
  assert.throws(
    () => parseModuleManifestText(JSON.stringify({
      ...sensorManifest,
      producers: [{
        ...sensorManifest.producers[0],
        inputs: [{ name: "basis", type: measurementType }],
        outputs: [{
          name: "measurement",
          type: measurementType,
          affinity: [{ resultPointer: "/value", inputPointer: "/value" }],
        }],
      }],
    })),
    /affinity\[0\]\.input must be a string/u,
  );
});

test("Core sees affinity restored by the static Manifest reader", () => {
  const parsed = parseModuleManifestText(JSON.stringify({
    ...sensorManifest,
    producers: [{
      ...sensorManifest.producers[0],
      inputs: [{ name: "basis", type: measurementType }],
      outputs: [{
        name: "measurement",
        type: measurementType,
        affinity: [{
          resultPointer: "/value",
          input: "missing-after-json-roundtrip",
          inputPointer: "/value",
        }],
      }],
    }],
  }));

  assert.throws(
    () => createResolvedClosure([contractManifest, parsed]),
    /references unknown input missing-after-json-roundtrip/u,
  );
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
