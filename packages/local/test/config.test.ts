import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { digestOf } from "@narratage/protocol";
import {
  createRuntimeComponentAdapterFacet,
  createRuntimeEndpointAdapterFacet,
} from "@narratage/runtime-adapter";
import { createSqliteRuntimeComponentPackage } from "@narratage/store-sqlite";
import {
  createRuntimeArchiveFromConfig,
  createRuntimeArtifactAccessFromConfig,
  doctorRuntimeConfig,
  parseRuntimeConfig,
  runtimeConfigRevision,
  RuntimeAdapterRegistry,
} from "@narratage/local";

const bindings = {
  scheduler: "execution.scheduler",
  worker: "execution.worker",
  stores: {
    build: "state.builds",
    operations: "state.operations",
    dispatch: "state.dispatch",
    artifacts: "artifacts.store",
    credentials: [] as string[],
  },
};

function profile(config: {
  readonly dataRoot?: string;
  readonly components?: Readonly<Record<string, unknown>>;
  readonly endpoints?: Readonly<Record<string, unknown>>;
  readonly selectedBindings?: typeof bindings;
  readonly runtimePackageLock?: string;
} = {}) {
  return {
    format: "narratage.runtime-profile@1",
    ...(config.runtimePackageLock === undefined ? {} : { runtimePackageLock: config.runtimePackageLock }),
    runtime: {
      use: "@narratage/local",
      config: {
        dataRoot: config.dataRoot ?? ".narratage/runtimes/local",
        components: config.components ?? {},
        bindings: config.selectedBindings ?? bindings,
        endpoints: config.endpoints ?? {},
        limits: { maxOperations: 3 },
      },
    },
  };
}

test("Runtime Profile keeps deployment data separate from source and derives instance names from maps", () => {
  const parsed = parseRuntimeConfig(profile({
    components: { state: { use: "example.state", config: { path: "state.sqlite" } } },
    endpoints: { generation: { use: "example.provider", authority: "shared" } },
  }));
  assert.equal(parsed.dataRoot, ".narratage/runtimes/local");
  assert.deepEqual(parsed.components, [{
    use: "example.state",
    instance: "state",
    config: { path: "state.sqlite" },
  }]);
  assert.deepEqual(parsed.endpoints, [{
    use: "example.provider",
    instance: "generation",
    authority: "shared",
  }]);
  assert.deepEqual(parsed.bindings, bindings);
  assert.equal("root" in parsed, false);
  assert.equal("packageLock" in parsed, false);
});

test("Runtime Profile rejects source ownership fields", () => {
  assert.throws(() => parseRuntimeConfig({ ...profile(), packageLock: "./svml.packages.lock" }),
    /does not accept packageLock/u);
  assert.throws(() => parseRuntimeConfig({ ...profile(), root: "." }),
    /does not accept root/u);
});

test("Runtime revision follows Profile content and its Runtime lock only", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-revision-"));
  const profilePath = join(root, "deployment.profile");
  const lockPath = join(root, "runtime.lock");
  const lock = (label: string) => {
    const content = {
      format: "svml.node-package-lock@1" as const,
      selected: [],
      artifacts: [{ name: `example-${label}`, version: "1", digest: digestOf(label) }],
      packages: [],
    };
    return JSON.stringify({ ...content, digest: digestOf(content) });
  };
  try {
    await writeFile(lockPath, lock("one"), "utf8");
    await writeFile(profilePath, JSON.stringify(profile({ runtimePackageLock: "./runtime.lock" })), "utf8");
    const first = await runtimeConfigRevision(profilePath);
    await writeFile(profilePath, JSON.stringify(profile({ runtimePackageLock: "./runtime.lock" }), null, 2), "utf8");
    assert.equal(await runtimeConfigRevision(profilePath), first);
    await writeFile(lockPath, lock("two"), "utf8");
    assert.notEqual(await runtimeConfigRevision(profilePath), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archive observation constructs only the Components bound to archive roles", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-slice-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    components: {
      state: { use: "example.state" },
      artifacts: { use: "example.artifacts" },
    },
  })));
  let artifactConstructions = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeComponentAdapterFacet({
    use: "example.state",
    validate() {},
    create(context) {
      return createSqliteRuntimeComponentPackage({
        path: join(context.dataRoot, "state.sqlite"),
        buildInstance: `${context.instance}.builds`,
        operationInstance: `${context.instance}.operations`,
        dispatchInstance: `${context.instance}.dispatch`,
        readOnly: context.access === "read-only",
      });
    },
  }));
  registry.registerFacet(createRuntimeComponentAdapterFacet({
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
  const path = join(root, "svml.runtime.json");
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
        bindings: [],
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
