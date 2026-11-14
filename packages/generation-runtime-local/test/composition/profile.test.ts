import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseLocalExecutionEnvironmentProfile } from "@hypit/execution-environment-local/profile";
import {
  parseLocalRuntimeProfile,
  readRuntimePlanningPolicy,
} from "../../src/config.js";
import { readRuntimeWorkerOptions } from "../../src/config.js";

import {
  environmentProfile,
  profile,
  writeProfilePair,
} from "./config-scenario.js";

test("Local Environment Profile names credentials and Endpoints, not project result storage", () => {
  const parsed = parseLocalExecutionEnvironmentProfile(environmentProfile({
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { generation: { use: "example.provider", pool: "shared" } },
  }));
  assert.equal(parsed.dataRoot, ".hypit/environment/local");
  assert.deepEqual(parsed.credentials, [{ use: "example.credentials", instance: "secrets" }]);
  assert.deepEqual(parsed.endpoints, [{ use: "example.provider", instance: "generation", pool: "shared" }]);
});

test("execution memory policy belongs to the local Worker, with an explicit MiB budget", () => {
  assert.deepEqual(parseLocalRuntimeProfile({ ...profile(), worker: { executionMemoryMb: 768 } }).worker,
    { executionMemoryMb: 768 });
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), worker: { executionMemoryMb: 0 } }), /positive integer/u);
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), worker: { executionMemoryMb: 768, maxBuilds: 8 } }), /maxBuilds/u);
});

test("Producer inline Value policy belongs to captured Build execution", () => {
  assert.deepEqual(parseLocalRuntimeProfile({ ...profile(), execution: { producerInlineValueBytes: 8_388_608 } }).execution,
    { producerInlineValueBytes: 8_388_608 });
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), execution: { producerInlineValueBytes: 0 } }),
    /positive integer in bytes/u);
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), execution: {
    producerInlineValueBytes: 8_388_608, producerTimeoutMs: 1000,
  } }), /producerTimeoutMs/u);
});

test("Producer planning reads the same inline Value policy as Build execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-profile-planning-policy-"));
  const path = join(directory, "runtime.json");
  try {
    await writeProfilePair(path, { execution: { producerInlineValueBytes: 16 } });
    assert.deepEqual(await readRuntimePlanningPolicy(path), {
      producerExecutionLimits: { maxInlineValueBytes: 16 },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("Local Runtime Profile rejects source ownership fields", () => {
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), root: "." }), /does not accept root/u);
});

test("Runtime Profile JSON diagnostics name the selected file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-profile-json-"));
  const path = join(directory, "broken.runtime.json");
  try {
    await writeFile(path, "{ broken");
    await assert.rejects(readRuntimeWorkerOptions(path), new RegExp(`Runtime Profile ${path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} is not valid JSON`, "u"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
