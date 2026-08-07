import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
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
    services: [],
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
    services: [],
    endpoints: [],
    permissions: [],
  }).catalogPath, ".svml/catalog.sqlite");
  assert.throws(() => parseRuntimeConfig({
    format: "svml.runtime-config@1",
    services: [],
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
    services: [],
    endpoints: [{ use: "example.missing", instance: "missing", config: {} }],
    permissions: [],
  }));
  await assert.rejects(
    async () => await createRuntimeFromConfig(path, { registry: new RuntimeConfigRegistry() }),
    /adapter example\.missing is not registered/u,
  );
});
