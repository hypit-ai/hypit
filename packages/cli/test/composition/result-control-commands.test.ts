import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { CliDistribution } from "../../src/distribution.js";
import { runCliApplication } from "../../src/application.js";
import type { CliIo } from "../../src/output.js";
import { createLocalCredentialControl } from "@hypit/runtime-local";
import { createLocalRuntimeCliCommandModules } from "../../../runtime-local/src/cli.js";
import type { LocalRuntimeHost } from "../../../runtime-local/src/host-api.js";
import { commandHint } from "../../src/command-hint.js";
import { cliDistribution } from "../distribution-scenario.js";
import { credentialControl, runtimeControl } from "../control-scenario.js";
import { runCli } from "./control-command-scenario.js";

test("result finish writes only an already-decided Result that needs attention", async () => {
  let finishes = 0;
  const blocked = {
    id: "build-blocked",
    createdAt: 1,
    activity: "saving-result" as const,
    outcome: "complete" as const,
    issue: { scope: "result" as const, message: "result store unavailable" },
    cancellationRequested: false,
    targets: [],
    acceptedRecords: 1,
    outstandingCommands: 0,
    operations: [],
  };
  const control = runtimeControl({
    async inspect() { return blocked; },
    async close() {},
  });
  const resultControl = {
    async finishResult() {
      finishes += 1;
      return { id: blocked.id, outcome: blocked.outcome };
    },
    async close() {},
  };
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
      openResultControl: async () => resultControl,
      createRuntime: async () => {
        throw new Error("continuing a Result must not construct execution Providers");
      },
    }),
  });
  let output = "";

  await runCli([
    "result", "finish", "build-blocked", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.equal(finishes, 1);
  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-result-finish@1",
    build: "build-blocked",
    outcome: "complete",
  });
});

test("result discard invokes only the exact one-shot Result control", async () => {
  const calls: string[] = [];
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => ({ async close() { calls.push("control.close"); } }),
      openResultControl: async () => ({
        async discardSubmission(build: string) {
          calls.push(`discard:${build}`);
          return true;
        },
        async close() { calls.push("result-control.close"); },
      }),
    }),
  });
  let output = "";

  await runCli([
    "result", "discard", "build-submitting", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(calls, ["discard:build-submitting", "result-control.close"]);
  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-result-discard@1", build: "build-submitting", discarded: true,
  });
});
