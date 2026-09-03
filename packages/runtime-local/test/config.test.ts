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
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import { credentialRef } from "@hypit/runtime";
import { SqliteRuntimeState } from "@hypit/store-sqlite";
import {
  createRuntimeControlFromConfig,
  createRuntimeFromConfig,
  createRuntimeResultControlFromConfig,
  doctorProjectBuildResultRepository,
  doctorRuntimeConfig,
  openProjectBuildResultRepository,
  parseLocalRuntimeProfile,
  preflightRuntimeConfig,
} from "@hypit/runtime-local";
function profile(config: {
  readonly dataRoot?: string;
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
} = {}) {
  return {
    format: "hypit.runtime-local@1",
    dataRoot: config.dataRoot ?? ".hypit/runtimes/local",
    credentials: config.credentials ?? {},
    endpoints: config.endpoints ?? {},
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

