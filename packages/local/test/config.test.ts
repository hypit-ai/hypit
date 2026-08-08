import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createRuntimeEndpointAdapterFacet } from "@narratage/runtime-adapter";

import {
  createRuntimeFromConfig,
  doctorRuntimeConfig,
  parseRuntimeConfig,
  RuntimeAdapterRegistry,
} from "@narratage/local";

test("declarative Runtime config starts the domain-neutral local defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-runtime-config-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    endpoints: [],
    permissions: [],
    scheduling: { maxConcurrency: 3, lanes: { generation: 2 } },
  }));
  const runtime = await createRuntimeFromConfig(path, { registry: new RuntimeAdapterRegistry() });
  try {
    assert.equal((await runtime.status("absent")).build, undefined);
  } finally {
    await runtime.close();
  }
});

test("Runtime config is closed data and rejects unknown environment authority", () => {
  assert.equal(parseRuntimeConfig({
    format: "svml.runtime-config@1",
    catalogPath: ".svml/catalog.sqlite",
    endpoints: [],
    permissions: [],
  }).catalogPath, ".svml/catalog.sqlite");
  assert.throws(() => parseRuntimeConfig({
    format: "svml.runtime-config@1",
    endpoints: [],
    permissions: [],
    apiKey: "must-not-live-here",
  }), /does not accept apiKey/u);
});

test("declarative adapters are explicit and never guessed", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-runtime-adapter-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    endpoints: [{ use: "example.missing", instance: "missing", config: {} }],
    permissions: [],
  }));
  await assert.rejects(
    async () => await createRuntimeFromConfig(path, { registry: new RuntimeAdapterRegistry() }),
    /adapter example\.missing is not registered/u,
  );
});

test("runtimeServices names the Runtime's own replaceable parts, apart from external services", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-runtime-config-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    runtimeServices: [{ use: "@example/store", instance: "artifacts.example" }],
    endpoints: [],
    permissions: [],
  }));
  const document = parseRuntimeConfig(JSON.parse(await readFile(path, "utf8")));
  assert.deepEqual(document.runtimeServices, [{ use: "@example/store", instance: "artifacts.example" }]);

  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    services: [],
    endpoints: [],
    permissions: [],
  }));
  await assert.rejects(
    async () => parseRuntimeConfig(JSON.parse(await readFile(path, "utf8"))),
    /does not accept services/u,
    "the word services now belongs to the external processes a deployment must have running",
  );
  await rm(root, { recursive: true, force: true });
});

test("doctor names the external program a Provider needs, and the command that supplies it", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-external-service-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    endpoints: [
      { use: "example.absent", instance: "absent", config: {} },
      { use: "example.wrong", instance: "wrong", config: {} },
      { use: "example.exploding", instance: "exploding", config: {} },
    ],
    permissions: [],
  }));

  const registry = new RuntimeAdapterRegistry();
  const declare = (use: string, service: unknown) =>
    registry.registerFacet(createRuntimeEndpointAdapterFacet({
      use,
      create: () => ({}) as never,
      service: () => service as never,
    }));
  declare("example.absent", {
    id: "absent-one",
    start: { command: "uv", args: ["run", "serve"] },
    probe: async () => ({ state: "down", detail: "nothing is answering at http://127.0.0.1:1" }),
  });
  declare("example.wrong", {
    id: "wrong-one",
    probe: async () => ({ state: "mismatch", detail: "model is large-v3, expected small" }),
  });
  declare("example.exploding", {
    id: "exploding-one",
    probe: async () => { throw new Error("the probe itself is broken"); },
  });

  const { diagnostics } = await doctorRuntimeConfig(path, { registry });
  const seen = diagnostics.map((item) => `${item.code}: ${item.message}`);

  assert.deepEqual(seen, [
    "EXTERNAL_SERVICE_DOWN: absent-one is not usable: nothing is answering at http://127.0.0.1:1."
      + " Bring it up with: narratage services up",
    // Nothing to prepare and nothing to start: report the difference, name no command.
    "EXTERNAL_SERVICE_MISMATCH: wrong-one is running but differs from this Runtime Profile:"
      + " model is large-v3, expected small",
    // A broken probe is a broken Provider, never a silently healthy service.
    "EXTERNAL_SERVICE_PROBE_FAILED: the probe itself is broken",
  ]);
  await rm(root, { recursive: true, force: true });
});
