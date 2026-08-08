import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRuntimeFromConfig,
  parseRuntimeConfig,
  RuntimeConfigRegistry,
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
  const runtime = await createRuntimeFromConfig(path, { registry: new RuntimeConfigRegistry() });
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
    async () => await createRuntimeFromConfig(path, { registry: new RuntimeConfigRegistry() }),
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
