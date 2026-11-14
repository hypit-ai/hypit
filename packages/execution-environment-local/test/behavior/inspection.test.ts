import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defineEndpoint } from "@hypit/endpoint";
import { credentialRef } from "@hypit/execution-environment";
import { MemoryResourceStore } from "@hypit/resource-store";
import {
  createExecutionEnvironmentCredentialStoreAdapterFacet,
  createExecutionEnvironmentEndpointAdapterFacet,
  ExecutionEnvironmentAdapterRegistry,
} from "@hypit/execution-environment-local/extension";
import { LocalExecutionEnvironmentDeployment } from "@hypit/execution-environment-local/deployment";
import { createLocalExecutionEnvironmentHost } from "@hypit/execution-environment-local/host";
import { parseLocalExecutionEnvironmentProfile } from "@hypit/execution-environment-local/profile";

const capability = { module: { name: "example.model" }, name: "generate" } as const;
const returns = { module: { name: "example.value" }, name: "Output" } as const;
const capabilityAddress = "example.model#generate";

test("Environment bindings name an Endpoint in the same Profile", () => {
  const profile = parseLocalExecutionEnvironmentProfile({
    format: "hypit.execution-environment-local@1",
    dataRoot: ".hypit/environment/local",
    credentials: {},
    endpoints: { selected: { use: "example.selected" } },
    bindings: { [capabilityAddress]: "selected" },
  });
  assert.deepEqual(profile.bindings, { [capabilityAddress]: "selected" });
  assert.throws(() => parseLocalExecutionEnvironmentProfile({
    format: "hypit.execution-environment-local@1",
    dataRoot: ".hypit/environment/local",
    credentials: {},
    endpoints: { selected: { use: "example.selected" } },
    bindings: { [capabilityAddress]: "missing" },
  }), /is not an Endpoint instance of this Profile/u);
});

test("one Environment inspection owns binding, support and Provider pricing", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-environment-inspection-"));
  const registry = new ExecutionEnvironmentAdapterRegistry();
  registry.registerFacet(createExecutionEnvironmentCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({ value: {
      async resolve(ref) {
        return ref.store === "secrets" && ref.key === "selected.key" ? { secret: "configured" } : undefined;
      },
    } }),
  }));
  let pricingReads = 0;
  for (const [use, answer] of [["example.selected", "selected"], ["example.other", "other"]] as const) {
    registry.registerFacet(createExecutionEnvironmentEndpointAdapterFacet({
      use,
      activate: (context) => ({ endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        pricing: { kind: "page", url: "https://prices.example/models" },
        ...(answer === "selected" ? {
          credentials: { apiKey: credentialRef("secrets", "selected.key") },
          readPricing: async ({ request, credentials }) => {
            pricingReads += 1;
            assert.equal((await credentials()).apiKey?.secret, "configured");
            return [{ source: "https://prices.example/generate", data: request.constraints }];
          },
        } : {}),
        capabilities: [{
          capability,
          returns,
          lifecycle: "immediate",
          supports: (request) => (request.constraints as { allowed?: unknown }).allowed === true
            ? { status: "supported" }
            : { status: "unsupported", reason: "allowed must be true" },
          handler: async ({ request, reportProgress }) => {
            await reportProgress?.({ phase: "generating" });
            return { answer, constraints: request.constraints };
          },
        }],
      }) }),
    }));
  }
  const deployment = new LocalExecutionEnvironmentDeployment({
    format: "hypit.execution-environment-local@1",
    dataRoot: ".",
    credentials: [{ use: "example.credentials", instance: "secrets" }],
    endpoints: [
      { use: "example.selected", instance: "selected" },
      { use: "example.other", instance: "other" },
    ],
    bindings: { [capabilityAddress]: "selected" },
  }, root, { packageRoot: root, registry });
  const host = createLocalExecutionEnvironmentHost(join(root, "hypit.environment.json"), deployment);
  const query = { kind: "concrete", need: "request", capability, returns, constraints: { allowed: true } } as const;
  const inspection = await host.openInspection([query]);
  try {
    assert.deepEqual(await inspection.endpoints(), [{
      need: "request",
      capability,
      status: "resolved",
      support: "supported",
      endpoint: "selected",
      use: "example.selected",
      pricing: { kind: "page", url: "https://prices.example/models" },
      binding: "selected",
    }]);
    const priced = await inspection.pricing();
    assert.deepEqual(priced[0]?.pricingDocuments, [{
      source: "https://prices.example/generate",
      data: { allowed: true },
    }]);
    assert.equal(pricingReads, 1);
  } finally {
    await inspection.close();
  }
  const progress: string[] = [];
  assert.deepEqual(await host.invoke(
    { capability, returns, constraints: { allowed: true } },
    new MemoryResourceStore(),
    { reportProgress: async (event) => { progress.push(event.phase); } },
  ), { answer: "selected", constraints: { allowed: true } });
  assert.deepEqual(progress, ["generating"]);
  await assert.rejects(host.invoke(
    { capability, returns, constraints: { allowed: false } },
    new MemoryResourceStore(),
  ), /allowed must be true/u);
  await rm(root, { recursive: true, force: true });
});

test("preflight probes readiness without active diagnosis, while doctor and Program discovery use the selected Environment", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-environment-doctor-"));
  let activeChecks = 0;
  const registry = new ExecutionEnvironmentAdapterRegistry();
  registry.registerFacet(createExecutionEnvironmentEndpointAdapterFacet({
    use: "example.local",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        capabilities: [{ capability, returns, lifecycle: "immediate", handler: () => null }],
      }),
      program: { id: "example-service", probe: async () => ({ state: "down", detail: "not running" }) },
      diagnose: async () => { activeChecks += 1; return []; },
    }),
  }));
  const deployment = new LocalExecutionEnvironmentDeployment({
    format: "hypit.execution-environment-local@1",
    dataRoot: ".",
    credentials: [],
    endpoints: [{ use: "example.local", instance: "local" }],
    bindings: {},
  }, root, { packageRoot: root, registry });
  const host = createLocalExecutionEnvironmentHost(join(root, "hypit.environment.json"), deployment);
  assert.equal((await host.preflight({ endpoints: ["local"] })).diagnostics
    .some((item) => item.code === "MANAGED_PROGRAM_DOWN"), true);
  assert.equal(activeChecks, 0);
  const diagnosed = await host.doctor({ endpoints: ["local"] });
  assert.equal(activeChecks, 1);
  assert.equal(diagnosed.diagnostics.some((item) => item.code === "MANAGED_PROGRAM_DOWN"), true);
  assert.deepEqual((await host.declaredPrograms({ endpoints: ["local"] })).map((item) => ({
    instance: item.instance,
    id: item.program.id,
  })), [{ instance: "local", id: "example-service" }]);
  await rm(root, { recursive: true, force: true });
});
