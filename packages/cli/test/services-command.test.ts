import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/main.js";
import type { CliDistribution, ExternalServiceResult } from "../src/distribution.js";

const empty: ExternalServiceResult = { root: "/tmp", services: [] };

function distribution(calls: string[]): CliDistribution {
  return {
    name: "test",
    bootstrapPackages: [],
    runtimeProfileRevision: async () => "test-revision",
    externalServices: {
      up: async (path: string, options: { maxWaitMs?: number }) => {
        calls.push(`up ${path} ${JSON.stringify(options)}`);
        return empty;
      },
      down: async (path: string) => { calls.push(`down ${path}`); return empty; },
      report: async (path: string) => { calls.push(`report ${path}`); return empty; },
    },
  } as unknown as CliDistribution;
}

const io = { write: () => {} };

test("services dispatches its second word, and passes the wait only to up", async () => {
  const calls: string[] = [];
  await runCli(["services", "up", "/p/svml.runtime.json", "--max-wait-ms", "1000"], io, distribution(calls));
  await runCli(["services", "down", "/p/svml.runtime.json"], io, distribution(calls));
  await runCli(["services", "status", "/p/svml.runtime.json"], io, distribution(calls));
  assert.deepEqual(calls, [
    'up /p/svml.runtime.json {"maxWaitMs":1000}',
    "down /p/svml.runtime.json",
    "report /p/svml.runtime.json",
  ]);
});

test("services names its three words rather than guessing one", async () => {
  await assert.rejects(
    async () => await runCli(["services", "restart", "/p/svml.runtime.json"], io, distribution([])),
    /services takes up, down or status/u,
  );
});

test("waiting is a property of bringing up, not of looking or stopping", async () => {
  await assert.rejects(
    async () => await runCli(["services", "status", "/p/svml.runtime.json", "--max-wait-ms", "1000"], io, distribution([])),
    /--max-wait-ms applies to services up/u,
  );
});

test("services reads deployment selection from the Profile, never from flags", async () => {
  await assert.rejects(
    async () => await runCli(
      ["services", "up", "/p/svml.runtime.json", "--runtime", "other.json"],
      io,
      distribution([]),
    ),
    /services reads all deployment selection from the Runtime Profile itself/u,
  );
});

test("runtime up validates its Revision before starting any external program", async () => {
  const calls: string[] = [];
  const selected = distribution(calls);
  const failing = {
    ...selected,
    createRuntimeFromConfig: async () => {
      calls.push("runtime.validate");
      throw new Error("Runtime Closure conflict");
    },
  } as CliDistribution;
  await assert.rejects(
    async () => await runCli(["runtime", "up", "/p/svml.runtime.json"], io, failing),
    /Runtime Closure conflict/u,
  );
  assert.deepEqual(calls, ["runtime.validate"]);
});

test("services status reports readiness without turning an observation into a failed command", async () => {
  let output = "";
  let exitCode: number | undefined;
  const selected = distribution([]);
  selected.externalServices.report = async () => ({
    root: "/project",
    services: [{
      id: "speech-evidence.local",
      instances: ["speech.primary"],
      state: { state: "down", detail: "not running" },
    }],
  });
  await runCli(["services", "status", "/project/svml.runtime.json"], {
    write(text) { output += text; },
    setExitCode(code) { exitCode = code; },
  }, selected);
  assert.equal(exitCode, undefined);
  assert.match(output, /speech-evidence\.local: down — not running/u);
  assert.doesNotMatch(output, /Command failed/u);
});

test("an idle stopped Runtime is status data, not a command failure", async () => {
  let output = "";
  let exitCode: number | undefined;
  const selected = {
    ...distribution([]),
    createRuntimeControlFromConfig: async () => ({
      async queue() { return { dispatches: [], capacity: [], operations: [] }; },
      async close() {},
    }),
    externalServices: {
      ...distribution([]).externalServices,
      report: async () => ({ root: "/project", services: [] }),
    },
  } as unknown as CliDistribution;
  await runCli(["runtime", "status", "/project/svml.runtime.json"], {
    write(text) { output += text; },
    setExitCode(code) { exitCode = code; },
  }, selected);
  assert.equal(exitCode, undefined);
  assert.match(output, /Runtime status/u);
  assert.match(output, /Worker\s+stopped/u);
});
