import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRuntimeArtifactStoreAdapterFacet,
  createRuntimeEndpointAdapterFacet,
  RuntimeAdapterRegistry,
} from "@hypit/runtime-kit";
import { MemoryArtifactStore } from "@hypit/driver-node";
import { SqliteRuntimeState } from "@hypit/store-sqlite";
import {
  createRuntimeArchiveFromConfig,
  createRuntimeArtifactAccessFromConfig,
  doctorRuntimeConfig,
  parseRuntimeConfig,
  preflightRuntimeConfig,
} from "@hypit/runtime-local";

function profile(config: {
  readonly dataRoot?: string;
  readonly artifacts?: Readonly<Record<string, unknown>>;
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
} = {}) {
  return {
    format: "hypit.runtime-profile@1",
    runtime: {
      use: "@hypit/runtime-local",
      config: {
        dataRoot: config.dataRoot ?? ".hypit/runtimes/local",
        artifacts: config.artifacts ?? { use: "example.artifacts" },
        credentials: config.credentials ?? {},
        endpoints: config.endpoints ?? {},
      },
    },
  };
}

test("Runtime Profile names the stores and Endpoints used by one local Runtime", () => {
  const parsed = parseRuntimeConfig(profile({
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { generation: { use: "example.provider", pool: "shared" } },
  }));
  assert.equal(parsed.dataRoot, ".hypit/runtimes/local");
  assert.deepEqual(parsed.artifacts, { use: "example.artifacts", instance: "artifacts" });
  assert.deepEqual(parsed.credentials, [{ use: "example.credentials", instance: "secrets" }]);
  assert.deepEqual(parsed.endpoints, [{ use: "example.provider", instance: "generation", pool: "shared" }]);
});

test("Runtime Profile rejects source ownership fields", () => {
  assert.throws(() => parseRuntimeConfig({ ...profile(), root: "." }), /does not accept root/u);
});

test("archive inspection opens SQLite only; Artifact access opens the selected Store", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-slice-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({ dataRoot: "." })));
  const state = new SqliteRuntimeState(join(root, "runtime.sqlite"));
  state.close();
  let artifactConstructions = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeArtifactStoreAdapterFacet({
    use: "example.artifacts",
    validate() {},
    open() {
      artifactConstructions += 1;
      return { value: new MemoryArtifactStore() };
    },
  }));
  try {
    const archive = await createRuntimeArchiveFromConfig(path, { registry, readOnly: true });
    assert.equal((await archive.status("missing")).build, undefined);
    await archive.close();
    assert.equal(artifactConstructions, 0);
    const artifacts = await createRuntimeArtifactAccessFromConfig(path, { registry });
    await artifacts.close();
    assert.equal(artifactConstructions, 1);
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
  registry.registerFacet(createRuntimeArtifactStoreAdapterFacet({
    use: "example.artifacts",
    validate() {},
    open: () => ({ value: new MemoryArtifactStore() }),
  }));
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

test("preflight validates stores without running their active doctor", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-preflight-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({ dataRoot: "." })));
  let activeChecks = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeArtifactStoreAdapterFacet({
    use: "example.artifacts",
    validate() {},
    open: () => ({ value: new MemoryArtifactStore() }),
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
