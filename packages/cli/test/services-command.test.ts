import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/main.js";
import type { CliDistribution, ExternalServiceResult } from "../src/distribution.js";

const empty: ExternalServiceResult = { root: "/tmp", services: [] };

function distribution(calls: string[]): CliDistribution {
  return {
    name: "test",
    builtInPackageContributions: [],
    runFrontends: [],
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
