import assert from "node:assert/strict";
import test from "node:test";

// This suite verifies Executor handoff to Type-owner validation.

import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
  verifyRecordStructure,
} from "@hypit/kernel";
import {
  ProducerRegistry,
  Executor,
  EndpointRegistry,
} from "@hypit/executor";
import { InProcessBuildScheduler } from "@hypit/runtime";
import type {
  BuildState,
  CapabilityRef,
  AuthorGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import {
  RefinementError,
  RefinementRegistry,
  refineRecord,
  refineValue,
} from "@hypit/refinement";

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

async function runBuild(executor: Executor, state: BuildState) {
  return (await new InProcessBuildScheduler(executor).run([{
    id: "validation-test",
    definition: { format: "hypit.build-definition@1", program: state.program, plan: state.plan },
    facts: [],
  }]))[0]!;
}

const contractManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: contractModule.name,
  version: contractModule.version,
  dependencies: [],
  types: [measurementType.name],
  capabilities: [],
  producers: [],
};

const contractDependency = contractModule;

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
      result: { kind: "output" as const, name: "measurement", type: measurementType },
    },
    {
      name: requestProducer.name,
      inputs: [],
      result: { kind: "need" as const, name: "measurement", capability: measurementCapability },
    },
  ],
};

const reportManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: reportModule.name,
  version: reportModule.version,
  dependencies: [contractDependency],
  types: [reportType.name],
  capabilities: [],
  producers: [{
    name: reportProducer.name,
    inputs: [{ name: "measurement", type: measurementType }],
    result: { kind: "output" as const, name: "report", type: reportType },
  }],
};

function registry(): RefinementRegistry {
  const refinements = new RefinementRegistry();
  refinements.register(measurementType, ({ value }) => {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new Error("measurement must be an object");
    }
    const measured = (value as Readonly<Record<string, unknown>>).value;
    if (typeof measured !== "number" || measured % 2 !== 0) {
      throw new Error("measurement must be even");
    }
  });
  return refinements;
}

function program(): LinkedProgram {
  const closure = createResolvedClosure([contractManifest, sensorManifest, reportManifest]);
  return link(closure, []);
}

function outputGraph(): AuthorGraph {
  return sealAuthorGraph({
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
        result: { kind: "output" as const, name: "measurement", record: "measurement:root" },
      },
      {
        id: "report",
        producer: reportProducer,
        inputs: { measurement: { kind: "logical-output", id: "measurement" } },
        result: { kind: "output" as const, name: "report", record: "report:root" },
      },
    ],
  });
}

function outputBuild(linked: LinkedProgram, graph = outputGraph()) {
  return buildState(linked, graph, ["report"]);
}

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

function hosts(measured: number): ProducerRegistry {
  const hosts = new ProducerRegistry();
  hosts.registerProducer(measureProducer, () => ({ kind: "output", value: ({ value: measured, unit: "ticks" }) }));
  hosts.registerProducer(reportProducer, ({ inputs }) => ({ kind: "output", value: (`accepted:${JSON.stringify(inputs.measurement?.value)}`) }));
  return hosts;
}

test("three independent packages communicate through an owner-validated nominal Type", async () => {
  const linked = program();
  const result = await runBuild(new Executor({
    producers: hosts(4),
    refinements: registry(),
  }), outputBuild(linked));

  assert.equal(result.status, "complete");
  const measurement = result.state.records.find((record) => record.id === "measurement:root");
  assert.equal(result.state.records.find((record) => record.id === "report:root")?.type.name, "Report");

});

test("a structurally valid but semantically invalid Producer value never enters BuildState", async () => {
  const linked = program();
  const result = await runBuild(new Executor({
    producers: hosts(3),
    refinements: registry(),
  }), outputBuild(linked));

  assert.equal(result.status, "failed");
  assert.match(result.outcomes[0]?.message ?? "", /measurement must be even/u);
  assert.equal(result.state.records.some((record) => record.id === "measurement:root"), false);
});

function providerGraph(): AuthorGraph {
  return sealAuthorGraph({
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
  hosts.registerProducer(requestProducer, () => ({ kind: "need", constraints: { sample: "latest" } }));
  const endpoints = new EndpointRegistry();
  endpoints.registerImmediateEndpoint(
    "example:measurement-endpoint",
    measurementCapability,
    measurementType,
    () => ({ value: measured, unit: "ticks" }),
  );
  return await runBuild(
    new Executor({ producers: hosts, endpoints, refinements: registry() }),
    buildState(linked, graph, ["measurement"]),
  );
}

test("Endpoint results pass the same Type-owner validation gate as Producer results", async () => {
  const valid = await providerBuild(8);
  assert.equal(valid.status, "complete");

  const invalid = await providerBuild(7);
  assert.equal(invalid.status, "failed");
  assert.match(invalid.outcomes.at(-1)?.message ?? "", /measurement must be even/u);
  assert.equal(invalid.state.records.some((record) => record.id === "measurement:endpoint"), false);
});

test("authored values cross the Type owner's validation gate without carrying validation metadata", async () => {
  const linked = program();
  const raw = ({
    id: "measurement:authored",
    type: measurementType,
    value: ({ value: 10, unit: "ticks" }),
  });
  verifyRecordStructure(linked.closure, raw);
  await refineRecord(raw, registry());
  verifyRecordStructure(linked.closure, raw);
});

test("Type validation errors remain machine distinguishable", async () => {
  await assert.rejects(
    () => refineValue(
      measurementType,
      ({ value: 9, unit: "ticks" }),
      registry(),
    ),
    (error: unknown) => error instanceof RefinementError && error.code === "TYPE_REFINEMENT_REJECTED",
  );
});
