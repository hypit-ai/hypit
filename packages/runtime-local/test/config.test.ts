import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRuntimeCredentialStoreAdapterFacet,
  createRuntimeEndpointAdapterFacet,
  RuntimeAdapterRegistry,
} from "@hypit/runtime-kit";
import {
  BuildResultRepositoryRegistry,
  createBuildResultRepositoryHostFacet,
} from "@hypit/build-result-kit";
import { FileBuildResultRepository } from "@hypit/build-result";
import { MemoryResourceStore } from "@hypit/driver-node";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import { credentialRef } from "@hypit/runtime";
import { SqliteRuntimeState } from "@hypit/store-sqlite";
import {
  createRuntimeControlFromConfig,
  createRuntimeFromConfig,
  createRuntimeResultControlFromConfig,
  describeRuntimeConfigProviders,
  doctorProjectBuildResultRepository,
  doctorRuntimeConfig,
  invokeRuntimeConfigNeed,
  openProjectBuildResultRepository,
  parseLocalRuntimeProfile,
  preflightRuntimeConfig,
} from "@hypit/runtime-local";
function profile(config: {
  readonly dataRoot?: string;
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
  readonly bindings?: Readonly<Record<string, string>>;
} = {}) {
  return {
    format: "hypit.runtime-local@1",
    dataRoot: config.dataRoot ?? ".hypit/runtimes/local",
    credentials: config.credentials ?? {},
    endpoints: config.endpoints ?? {},
    ...(config.bindings === undefined ? {} : { bindings: config.bindings }),
  };
}

test("Local Runtime Profile names credentials and Endpoints, not project result storage", () => {
  const parsed = parseLocalRuntimeProfile(profile({
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { generation: { use: "example.provider", pool: "shared" } },
  }));
  assert.equal(parsed.dataRoot, ".hypit/runtimes/local");
  assert.deepEqual(parsed.credentials, [{ use: "example.credentials", instance: "secrets" }]);
  assert.deepEqual(parsed.endpoints, [{ use: "example.provider", instance: "generation", pool: "shared" }]);
});

test("Build Result repositories default to the project path and can be selected explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-results-"));
  const defaultProject = join(root, "default-project");
  const selectedProject = join(root, "selected-project");
  await Promise.all([
    mkdir(defaultProject, { recursive: true }),
    mkdir(selectedProject, { recursive: true }),
  ]);
  await writeFile(
    join(selectedProject, "hypit.results.json"),
    JSON.stringify({
      format: "hypit.build-results@1",
      use: "example.results",
      config: { name: "episode-12" },
    }),
  );
  const registry = new BuildResultRepositoryRegistry();
  let openedContext: unknown;
  let diagnosedContext: unknown;
  registry.registerFacet(
    createBuildResultRepositoryHostFacet({
      use: "example.results",
      validate(context) {
        assert.deepEqual(context.config, { name: "episode-12" });
      },
      open(context) {
        openedContext = context;
        return {
          repository: new FileBuildResultRepository(join(root, "remote-fixture")),
        };
      },
      doctor(context) {
        diagnosedContext = context;
        return [];
      },
    }),
  );
  try {
    const local = await openProjectBuildResultRepository(defaultProject, {
      packageRoot: process.cwd(),
    });
    assert.ok(local.repository instanceof FileBuildResultRepository);
    assert.equal(local.location.root, defaultProject);
    assert.deepEqual(local.location.selection, {
      use: "@hypit/build-result-fs",
      config: { path: ".hypit/results" },
    });

    const selected = await openProjectBuildResultRepository(selectedProject, {
      resultRegistry: registry,
    });
    assert.deepEqual(openedContext, {
      root: selectedProject,
      config: { name: "episode-12" },
    });
    assert.deepEqual(selected.location, {
      root: selectedProject,
      selection: { use: "example.results", config: { name: "episode-12" } },
    });
    const diagnosed = await doctorProjectBuildResultRepository(selectedProject, {
      resultRegistry: registry,
    });
    assert.deepEqual(diagnosed.diagnostics, []);
    assert.deepEqual(diagnosedContext, {
      root: selectedProject,
      config: { name: "episode-12" },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Local Runtime Profile rejects source ownership fields", () => {
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), root: "." }), /does not accept root/u);
});

test("active Build inspection requires no selected ResourceStore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-slice-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({ dataRoot: "." })));
  const state = new SqliteRuntimeState(join(root, "runtime.sqlite"));
  state.close();
  const registry = new RuntimeAdapterRegistry();
  try {
    const control = await createRuntimeControlFromConfig(path, { registry, readOnly: true });
    assert.equal(await control.inspect("missing"), undefined);
    await control.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Result control opens without loading the Runtime Profile's Endpoint adapters", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-result-control-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { unavailable: { use: "package.that.must.not.load" } },
  })));
  try {
    const resultControl = await createRuntimeResultControlFromConfig(path, {
      registry: new RuntimeAdapterRegistry(),
    });
    await resultControl.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor reports a down Managed Program", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-program-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { speech: { use: "example.speech" } },
  })));
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.speech",
    activate: (context) => ({
      endpoint: {
        name: context.instance,
        instance: { id: context.instance, pool: context.pool ?? context.instance },
        offers: [],
        credentials: [],
        install() {},
      } as never,
      program: {
        id: "speech.local",
        probe: async () => ({ state: "down", detail: "not running" }),
      },
    }),
  }));
  try {
    const result = await doctorRuntimeConfig(path, { registry });
    assert.equal(result.diagnostics.some((item) => item.code === "MANAGED_PROGRAM_DOWN"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight validates credential stores without running their active doctor", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-preflight-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    credentials: { secrets: { use: "example.credentials" } },
  })));
  let activeChecks = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({ value: { async resolve() { return undefined; } } }),
    doctor: async () => {
      activeChecks += 1;
      return [];
    },
  }));
  try {
    const preflight = await preflightRuntimeConfig(path, { registry });
    assert.deepEqual(preflight.diagnostics, []);
    assert.equal(activeChecks, 0);
    await doctorRuntimeConfig(path, { registry });
    assert.equal(activeChecks, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight never runs an Endpoint's active doctor", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-endpoint-preflight-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { remote: { use: "example.remote" } },
  })));
  let activeChecks = 0;
  const capability = { module: { name: "example.remote", version: "1" }, name: "observe" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Observation" } as const;
  let diagnosedCapabilities: readonly string[] = [];
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.remote",
    activate: (context) => ({
      endpoint: {
        instance: { id: context.instance, pool: context.pool ?? context.instance },
        offers: [{ capability, returns, endpoint: context.instance }],
        credentials: [],
        install() {},
      },
      diagnose: async ({ capabilities }) => {
        activeChecks += 1;
        diagnosedCapabilities = (capabilities ?? []).map((item) => item.name);
        return [];
      },
    }),
  }));
  try {
    await preflightRuntimeConfig(path, { registry });
    assert.equal(activeChecks, 0);
    await doctorRuntimeConfig(path, { registry });
    assert.equal(activeChecks, 1);
    assert.deepEqual(diagnosedCapabilities, ["observe"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime providers name the selected Endpoint and its declared price source without contacting a service", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-providers-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { paid: { use: "example.paid" }, local: { use: "example.local" } },
  })));
  const generate = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const render = { module: { name: "example.render", version: "1" }, name: "render" } as const;
  const missing = { module: { name: "example.model", version: "1" }, name: "transcribe" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  const handler = () => ({ value: { kind: "inline" as const, value: null } });
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.paid",
    activate: (context) => ({
      endpoint: defineEndpointPackage({
        module: { name: "example.provider", version: "1" },
        facet: "paid",
        instance: context.instance,
        pool: context.pool ?? context.instance,
        pricing: { kind: "page", url: "https://prices.example/models" },
        capabilities: [{ capability: generate, returns, lifecycle: "immediate", handler }],
      }),
    }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.local",
    activate: (context) => ({
      endpoint: defineEndpointPackage({
        module: { name: "example.local-provider", version: "1" },
        facet: "local",
        instance: context.instance,
        pool: context.pool ?? context.instance,
        pricing: { kind: "local" },
        capabilities: [{ capability: render, returns, lifecycle: "immediate", handler }],
      }),
    }),
  }));
  try {
    assert.deepEqual(await describeRuntimeConfigProviders(path, [generate, render, missing], { registry }), [
      {
        capability: generate,
        status: "resolved",
        endpoint: "paid",
        use: "example.paid",
        pricing: { kind: "page", url: "https://prices.example/models" },
      },
      { capability: render, status: "resolved", endpoint: "local", use: "example.local", pricing: { kind: "local" } },
      { capability: missing, status: "unresolved" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime invoke executes one immediate Need through the selected Endpoint and its credential, outside any Build", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-invoke-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { paid: { use: "example.paid" }, slow: { use: "example.slow" } },
  })));
  const observe = { module: { name: "example.model", version: "1" }, name: "observe" } as const;
  const generate = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const missing = { module: { name: "example.model", version: "1" }, name: "transcribe" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  let configured = true;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({
      value: {
        async resolve(ref) {
          return configured && ref.store === "secrets" && ref.key === "paid.key" ? { secret: "configured" } : undefined;
        },
      },
    }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.paid",
    activate: (context) => ({
      endpoint: defineEndpointPackage({
        module: { name: "example.provider", version: "1" },
        facet: "paid",
        instance: context.instance,
        pool: context.pool ?? context.instance,
        credentials: { apiKey: credentialRef("secrets", "paid.key") },
        capabilities: [{
          capability: observe,
          returns,
          lifecycle: "immediate",
          handler: ({ need, credentials }) => ({
            value: { kind: "inline", value: { seen: need.constraints, key: credentials.apiKey?.secret ?? null } },
          }),
        }],
      }),
    }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.slow",
    activate: (context) => ({
      endpoint: defineEndpointPackage({
        module: { name: "example.slow-provider", version: "1" },
        facet: "slow",
        instance: context.instance,
        pool: context.pool ?? context.instance,
        capabilities: [{
          capability: generate,
          returns,
          lifecycle: "asynchronous",
          endpoint: {
            start: async () => ({ status: "completed" as const, result: { value: { kind: "inline" as const, value: null } } }),
            poll: async () => ({ status: "completed" as const, result: { value: { kind: "inline" as const, value: null } } }),
          },
        }],
      }),
    }),
  }));
  const resources = { async get() { return undefined; }, async put() { throw new Error("unused"); } } as never;
  const need = (capability: typeof observe | typeof generate | typeof missing) => ({
    id: "need:creation-time", capability, returns, constraints: { question: "what happens?" }, result: "record:creation-time",
  });
  try {
    assert.deepEqual(await invokeRuntimeConfigNeed(path, need(observe), resources, { registry }), {
      value: { kind: "inline", value: { seen: { question: "what happens?" }, key: "configured" } },
    });
    await assert.rejects(invokeRuntimeConfigNeed(path, need(missing), resources, { registry }), /No Endpoint in .* serves example\.model@1#transcribe/u);
    await assert.rejects(invokeRuntimeConfigNeed(path, need(generate), resources, { registry }), /asynchronous capability/u);
    configured = false;
    await assert.rejects(invokeRuntimeConfigNeed(path, need(observe), resources, { registry }), /apiKey for Endpoint paid is not configured/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("a Profile binds a contested capability to one of its Endpoints, and says so when it cannot", () => {
  const generateKey = "example.model@1#generate";
  assert.deepEqual(parseLocalRuntimeProfile(profile({
    endpoints: { paid: { use: "example.paid" }, local: { use: "example.local" } },
    bindings: { [generateKey]: "local" },
  })).bindings, { [generateKey]: "local" });
  assert.throws(() => parseLocalRuntimeProfile(profile({
    endpoints: { paid: { use: "example.paid" } },
    bindings: { [generateKey]: "nowhere" },
  })), /names nowhere, which is not an Endpoint instance of this Profile \(paid\)/u);
  assert.throws(() => parseLocalRuntimeProfile(profile({ bindings: { "not a key": "paid" } })), /capability key/u);
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), stale: 1, older: 2 }), /does not accept stale, older; it accepts/u);
  assert.throws(() => parseLocalRuntimeProfile({
    format: "hypit.runtime-profile@1",
    runtime: { use: "@hypit/runtime-local", config: {} },
  }), /retired hypit.runtime-profile@1 shape/u);
});

test("providers, doctor and invoke share one resolver: a contested capability is ambiguous until the Profile binds it", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-bindings-"));
  const generate = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const render = { module: { name: "example.render", version: "1" }, name: "render" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  const generateKey = "example.model@1#generate";
  const registry = new RuntimeAdapterRegistry();
  for (const [use, instanceLabel, capability, answer] of [
    ["example.paid", "paid", generate, "paid"],
    ["example.other", "other", generate, "other"],
    ["example.local", "local", render, "local"],
  ] as const) {
    registry.registerFacet(createRuntimeEndpointAdapterFacet({
      use,
      activate: (context) => ({
        endpoint: defineEndpointPackage({
          module: { name: `example.provider.${instanceLabel}`, version: "1" },
          facet: instanceLabel,
          instance: context.instance,
          pool: context.pool ?? context.instance,
          pricing: { kind: "local" },
          capabilities: [{ capability, returns, lifecycle: "immediate", handler: () => ({ value: { kind: "inline" as const, value: answer } }) }],
        }),
      }),
    }));
  }
  const endpoints = { paid: { use: "example.paid" }, other: { use: "example.other" }, local: { use: "example.local" } };
  const need = { id: "need:1", capability: generate, returns, constraints: null, result: "record:1" };
  try {
    const unbound = join(root, "unbound.json");
    await writeFile(unbound, JSON.stringify(profile({ dataRoot: ".", endpoints })));
    assert.deepEqual(await describeRuntimeConfigProviders(unbound, [generate, render], { registry }), [
      { capability: generate, status: "ambiguous", endpoints: ["other", "paid"] },
      { capability: render, status: "resolved", endpoint: "local", use: "example.local", pricing: { kind: "local" } },
    ]);
    const contested = (await preflightRuntimeConfig(unbound, { registry, capabilities: [generate] })).diagnostics
      .filter((item) => item.code === "RUNTIME_CAPABILITY_AMBIGUOUS");
    assert.equal(contested.length, 1);
    assert.equal(contested[0]!.severity, "error");
    assert.match(contested[0]!.message, /add "bindings": \{ "example\.model@1#generate": "<instance>" \}/u);
    // Without a Run, doctor looks at every selected Endpoint and reports the contest as a warning.
    const idle = (await preflightRuntimeConfig(unbound, { registry })).diagnostics
      .find((item) => item.code === "RUNTIME_CAPABILITY_AMBIGUOUS");
    assert.equal(idle?.severity, "warning");
    await assert.rejects(invokeRuntimeConfigNeed(unbound, need, new MemoryResourceStore(), { registry }), /Say which one does it/u);

    const bound = join(root, "bound.json");
    await writeFile(bound, JSON.stringify(profile({ dataRoot: ".", endpoints, bindings: { [generateKey]: "other" } })));
    assert.deepEqual(await describeRuntimeConfigProviders(bound, [generate], { registry }), [
      { capability: generate, status: "resolved", endpoint: "other", use: "example.other", pricing: { kind: "local" }, binding: "other" },
    ]);
    assert.equal((await preflightRuntimeConfig(bound, { registry, capabilities: [generate] })).diagnostics
      .some((item) => item.code === "RUNTIME_CAPABILITY_AMBIGUOUS"), false);
    const fulfilled = await invokeRuntimeConfigNeed(bound, need, new MemoryResourceStore(), { registry });
    assert.deepEqual(fulfilled.value, { kind: "inline", value: "other" });

    const wrong = join(root, "wrong.json");
    await writeFile(wrong, JSON.stringify(profile({ dataRoot: ".", endpoints, bindings: { [generateKey]: "local" } })));
    assert.deepEqual(await describeRuntimeConfigProviders(wrong, [generate], { registry }), [
      { capability: generate, status: "unresolved", binding: "local" },
    ]);
    assert.ok((await preflightRuntimeConfig(wrong, { registry, capabilities: [generate] })).diagnostics
      .some((item) => item.code === "RUNTIME_BINDING_INVALID"));
    await assert.rejects(invokeRuntimeConfigNeed(wrong, need, new MemoryResourceStore(), { registry }), /binds example\.model@1#generate to local, which does not serve/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor reports two Endpoints that share a pool but size it differently", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-pools-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: {
      four: { use: "example.four", pool: "generation" },
      ten: { use: "example.ten", pool: "generation" },
    },
  })));
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  const registry = new RuntimeAdapterRegistry();
  for (const [use, name, concurrency] of [["example.four", "four", 4], ["example.ten", "ten", 10]] as const) {
    registry.registerFacet(createRuntimeEndpointAdapterFacet({
      use,
      activate: (context) => ({
        endpoint: defineEndpointPackage({
          module: { name: `example.provider.${name}`, version: "1" },
          facet: name,
          instance: context.instance,
          pool: context.pool ?? context.instance,
          pricing: { kind: "local" },
          defaultConcurrency: concurrency,
          capabilities: [{
            capability: { module: { name: "example.model", version: "1" }, name },
            returns,
            lifecycle: "immediate",
            handler: () => ({ value: { kind: "inline" as const, value: null } }),
          }],
        }),
      }),
    }));
  }
  try {
    const conflict = (await preflightRuntimeConfig(path, { registry })).diagnostics.find((item) => item.code === "RUNTIME_POOL_CONFLICT");
    assert.ok(conflict, "the shared pool is reported");
    assert.match(conflict.message, /four, ten share pool:generation but size it 4 and 10/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
