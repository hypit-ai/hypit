import assert from "node:assert/strict";
import test from "node:test";

import type { LocalCredentialControl, LocalRuntimeControl } from "@narratage/local";

import type { CliDistribution } from "../src/distribution.js";
import { runCli } from "../src/main.js";

test("queue opens durable control without constructing execution Providers", async () => {
  const calls: string[] = [];
  const control = {
    async queue() {
      calls.push("control.queue");
      return { dispatches: [], capacity: [], operations: [] };
    },
    async close() {
      calls.push("control.close");
    },
  } as unknown as LocalRuntimeControl;
  const distribution = {
    createRuntimeControlFromConfig: async () => {
      calls.push("control.create");
      return control;
    },
    createRuntimeFromConfig: async () => {
      calls.push("execution.create");
      throw new Error("execution Providers must not be constructed");
    },
  } as unknown as CliDistribution;
  let output = "";

  await runCli(
    ["queue", "--runtime", "/tmp/narratage-control-profile.json", "--json"],
    { write: (text) => { output += text; } },
    distribution,
  );

  assert.deepEqual(calls, ["control.create", "control.queue", "control.close"]);
  const result = JSON.parse(output) as {
    readonly format: string;
    readonly at: number;
    readonly dispatches: readonly unknown[];
    readonly capacity: readonly unknown[];
    readonly operations: readonly unknown[];
  };
  assert.equal(result.format, "narratage.cli-queue@1");
  assert.equal(typeof result.at, "number");
  assert.deepEqual(result.dispatches, []);
  assert.deepEqual(result.capacity, []);
  assert.deepEqual(result.operations, []);
});

test("command options fail closed instead of being silently ignored", async () => {
  const distribution = {} as CliDistribution;
  const io = { write() {} };
  await assert.rejects(
    async () => await runCli([
      "status", "build-1", "--runtime", "/tmp/runtime.json", "--root", "/tmp",
    ], io, distribution),
    /--root does not apply to status/u,
  );
  await assert.rejects(
    async () => await runCli([
      "queue", "--runtime", "/tmp/one.json", "--runtime", "/tmp/two.json",
    ], io, distribution),
    /--runtime cannot be repeated/u,
  );
});

test("auth opens only one Endpoint credential control, never the execution Runtime", async () => {
  const calls: string[] = [];
  const credentials = {
    async credentials(endpoint?: string) {
      calls.push(`credentials.status:${endpoint}`);
      return [{
        endpoint: "kie.project",
        slot: "apiKey",
        label: "KIE API key",
        kind: "secret",
        ref: { format: "svml.credential-ref@1", store: "env", key: "KIE_API_KEY" },
        configured: false,
        writable: false,
      }];
    },
    async close() { calls.push("credentials.close"); },
  } as unknown as LocalCredentialControl;
  const distribution = {
    createRuntimeCredentialsFromConfig: async (_path: string, endpoint: string) => {
      calls.push(`credentials.create:${endpoint}`);
      return credentials;
    },
    createRuntimeFromConfig: async () => {
      calls.push("execution.create");
      throw new Error("auth must not construct execution");
    },
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "auth", "status", "kie.project", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(calls, [
    "credentials.create:kie.project",
    "credentials.status:kie.project",
    "credentials.close",
  ]);
  assert.equal((JSON.parse(output) as { readonly endpoint?: string }).endpoint, "kie.project");
});
