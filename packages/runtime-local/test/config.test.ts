import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { SqliteRuntimeState } from "@hypit/store-sqlite";
import {
  createRuntimeArchiveFromConfig,
  createRuntimeArtifactAccessFromConfig,
  doctorRuntimeConfig,
  openBuildResultRepositoryFromConfig,
  parseRuntimeConfig,
  preflightRuntimeConfig,
} from "@hypit/runtime-local";

function profile(config: {
  readonly dataRoot?: string;
  readonly results?: Readonly<Record<string, unknown>>;
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
} = {}) {
  return {
    format: "hypit.runtime-profile@1",
    runtime: {
      use: "@hypit/runtime-local",
      config: {
        dataRoot: config.dataRoot ?? ".hypit/runtimes/local",
        ...(config.results === undefined ? {} : { results: config.results }),
        credentials: config.credentials ?? {},
        endpoints: config.endpoints ?? {},
      },
    },
  };
}

test("Runtime Profile names the result repository, credentials and Endpoints", () => {
  const parsed = parseRuntimeConfig(profile({
    results: { use: "example.results", config: { bucket: "project" } },
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { generation: { use: "example.provider", pool: "shared" } },
  }));
  assert.equal(parsed.dataRoot, ".hypit/runtimes/local");
  assert.deepEqual(parsed.results, {
    use: "example.results",
    instance: "results",
    config: { bucket: "project" },
  });
  assert.deepEqual(parsed.credentials, [{ use: "example.credentials", instance: "secrets" }]);
  assert.deepEqual(parsed.endpoints, [{ use: "example.provider", instance: "generation", pool: "shared" }]);
});

test("Build Result repositories default to the project path and can be selected explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-results-"));
  const defaultProfile = join(root, "default.runtime.json");
  const selectedProfile = join(root, "selected.runtime.json");
  const defaultRoot = join(root, "project", ".hypit", "results");
  await writeFile(defaultProfile, JSON.stringify(profile()));
  await writeFile(
    selectedProfile,
    JSON.stringify(
      profile({
        results: { use: "example.results", config: { name: "episode-12" } },
      }),
    ),
  );
  const registry = new BuildResultRepositoryRegistry();
  let openedContext: unknown;
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
    }),
  );
  try {
    const local = await openBuildResultRepositoryFromConfig(defaultProfile, defaultRoot, {
      packageRoot: process.cwd(),
    });
    assert.ok(local.repository instanceof FileBuildResultRepository);
    assert.equal(local.location.root, defaultRoot);
    assert.deepEqual(local.location.selection, {
      use: "@hypit/build-result-fs",
      config: { path: "." },
    });

    const selected = await openBuildResultRepositoryFromConfig(selectedProfile, defaultRoot, {
      resultRegistry: registry,
    });
    assert.deepEqual(openedContext, {
      root,
      config: { name: "episode-12" },
    });
    assert.deepEqual(selected.location, {
      root,
      selection: { use: "example.results", config: { name: "episode-12" } },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime Profile rejects source ownership fields", () => {
  assert.throws(() => parseRuntimeConfig({ ...profile(), root: "." }), /does not accept root/u);
});

test("archive inspection and working Artifact access require no selected ArtifactStore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-slice-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({ dataRoot: "." })));
  const state = new SqliteRuntimeState(join(root, "runtime.sqlite"));
  state.close();
  const registry = new RuntimeAdapterRegistry();
  try {
    const archive = await createRuntimeArchiveFromConfig(path, { registry, readOnly: true });
    assert.equal((await archive.status("missing")).build, undefined);
    await archive.close();
    const artifacts = await createRuntimeArtifactAccessFromConfig(path, { registry });
    assert.equal(await artifacts.readArtifact("sha256:0000000000000000000000000000000000000000000000000000000000000000"), undefined);
    await artifacts.close();
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
