import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRuntimeInfrastructureAdapterFacet,
  createRuntimeEndpointAdapterFacet,
} from "@narratage/runtime-kit";
import { createSqliteRuntimeInfrastructurePackage } from "@narratage/store-sqlite";
import {
  createRuntimeArchiveFromConfig,
  createRuntimeArtifactAccessFromConfig,
  doctorRuntimeConfig,
  parseRuntimeConfig,
  runtimeConfigRevision,
  RuntimeAdapterRegistry,
} from "@narratage/runtime-local";

const roles = {
  scheduler: { from: "execution", part: "scheduler" },
  worker: { from: "execution", part: "worker" },
  buildStore: { from: "state", part: "builds" },
  operationStore: { from: "state", part: "operations" },
  dispatchStore: { from: "state", part: "dispatch" },
  artifactStore: { from: "artifacts", part: "store" },
  credentialStores: [] as { from: string; part: string }[],
};

function profile(config: {
  readonly dataRoot?: string;
  readonly infrastructure?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
  readonly selectedRoles?: typeof roles;
} = {}) {
  return {
    format: "narratage.runtime-profile@1",
    runtime: {
      use: "@narratage/runtime-local",
      config: {
        dataRoot: config.dataRoot ?? ".narratage/runtimes/local",
        infrastructure: config.infrastructure ?? {},
        roles: config.selectedRoles ?? roles,
        endpoints: config.endpoints ?? {},
        capacity: { maxActiveOperations: 3 },
      },
    },
  };
}

test("Runtime Profile keeps deployment data separate from source and derives instance names from maps", () => {
  const parsed = parseRuntimeConfig(profile({
    infrastructure: { state: { use: "example.state", config: { path: "state.sqlite" } } },
    endpoints: { generation: { use: "example.provider", pool: "shared" } },
  }));
  assert.equal(parsed.dataRoot, ".narratage/runtimes/local");
  assert.deepEqual(parsed.infrastructure, [{
    use: "example.state",
    instance: "state",
    config: { path: "state.sqlite" },
  }]);
  assert.deepEqual(parsed.endpoints, [{
    use: "example.provider",
    instance: "generation",
    pool: "shared",
  }]);
  assert.deepEqual(parsed.roles, roles);
  assert.equal("root" in parsed, false);
});

test("Runtime Profile rejects source ownership fields", () => {
  assert.throws(() => parseRuntimeConfig({ ...profile(), root: "." }),
    /does not accept root/u);
});

test("Runtime revision follows Profile meaning rather than formatting", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-revision-"));
  const profilePath = join(root, "deployment.profile");
  try {
    await writeFile(profilePath, JSON.stringify(profile()), "utf8");
    const first = await runtimeConfigRevision(profilePath);
    await writeFile(profilePath, JSON.stringify(profile(), null, 2), "utf8");
    assert.equal(await runtimeConfigRevision(profilePath), first);
    await writeFile(profilePath, JSON.stringify(profile({ dataRoot: "elsewhere" })), "utf8");
    assert.notEqual(await runtimeConfigRevision(profilePath), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archive observation constructs only the infrastructure selected by archive roles", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-slice-"));
  const path = join(root, "narratage.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    infrastructure: {
      state: { use: "example.state" },
      artifacts: { use: "example.artifacts" },
    },
  })));
  let artifactConstructions = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeInfrastructureAdapterFacet({
    use: "example.state",
    validate() {},
    create(context) {
      return createSqliteRuntimeInfrastructurePackage({
        path: join(context.dataRoot, "state.sqlite"),
        instance: context.instance,
        readOnly: context.access === "read-only",
      });
    },
  }));
  registry.registerFacet(createRuntimeInfrastructureAdapterFacet({
    use: "example.artifacts",
    validate() {},
    create() {
      artifactConstructions += 1;
      throw new Error("artifact adapter constructed");
    },
  }));
  try {
    const archive = await createRuntimeArchiveFromConfig(path, { registry, readOnly: true });
    assert.equal((await archive.status("missing")).build, undefined);
    await archive.close();
    assert.equal(artifactConstructions, 0);
    await assert.rejects(createRuntimeArtifactAccessFromConfig(path, { registry, readOnly: true }),
      /artifact adapter constructed/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor reports a down Managed Program without inventing a Runtime default", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-program-"));
  const path = join(root, "narratage.runtime.json");
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
        manifest: { facets: [] },
        instance: { id: context.instance },
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
