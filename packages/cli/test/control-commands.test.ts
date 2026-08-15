import assert from "node:assert/strict";
import test from "node:test";

import type { CliDistribution } from "../src/distribution.js";
import { runCli } from "../src/main.js";
import type { CliCredentialControl, CliRuntimeArchiveControl } from "../src/runtime-port.js";

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
  } as unknown as CliRuntimeArchiveControl;
  const distribution = {
    runtimeProfileRevision: async () => "test-revision",
    createRuntimeArchiveFromConfig: async () => {
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
  const distribution = {
    createRuntimeArchiveFromConfig: async (path: string) => {
      throw new Error(`profile delegated: ${path}`);
    },
  } as unknown as CliDistribution;
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
  await assert.rejects(
    async () => await runCli([
      "build", "/tmp/build.svrun", "--runtime", "/tmp/runtime.json", "--build-id", "legacy-build",
    ], io, distribution),
    /unknown option --build-id/u,
  );
  await assert.rejects(
    async () => await runCli([
      "doctor", "/tmp/runtime.json", "--root", "/tmp",
    ], io, distribution),
    /doctor already uses the Runtime Profile directory and its declared root; remove --root/u,
  );
  await assert.rejects(
    async () => await runCli([
      "queue", "--runtime", "/tmp/svml.runtime.ts",
    ], io, distribution),
    /profile delegated: .*svml\.runtime\.ts/u,
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
  } as unknown as CliCredentialControl;
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

test("auth login rejects a read-only CredentialStore before asking for a secret", async () => {
  let prompted = false;
  let closed = false;
  const credentials = {
    async credentials() {
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
    async close() { closed = true; },
  } as unknown as CliCredentialControl;
  const distribution = {
    createRuntimeCredentialsFromConfig: async () => credentials,
  } as unknown as CliDistribution;

  await assert.rejects(
    async () => await runCli([
      "auth", "login", "kie.project", "--runtime", "/tmp/runtime.json",
    ], {
      write() {},
      readSecret: async () => {
        prompted = true;
        return "must-not-be-read";
      },
    }, distribution),
    /CredentialStore env is read-only.*set KIE_API_KEY/u,
  );
  assert.equal(prompted, false);
  assert.equal(closed, true);
});

test("cancelling a completed Build reports that no cancellation was requested", async () => {
  const control = {
    async cancel() {
      return {
        build: "build-complete",
        phase: "terminal",
        admission: "closed",
        terminal: "complete",
      };
    },
    async close() {},
  } as unknown as CliRuntimeArchiveControl;
  const distribution = {
    createRuntimeArchiveFromConfig: async () => control,
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "cancel", "build-complete", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(JSON.parse(output), {
    build: "build-complete",
    requested: false,
    phase: "terminal",
    admission: "closed",
    terminal: "complete",
  });
});
