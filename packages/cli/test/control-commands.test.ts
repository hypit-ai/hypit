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
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openArchive: async () => {
        calls.push("control.create");
        return control;
      },
      controller: async () => ({
        worker: { status: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }) },
      }),
      createRuntime: async () => {
        calls.push("execution.create");
        throw new Error("execution Providers must not be constructed");
      },
    }),
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

test("status --watch reattaches to one durable Build until it becomes terminal", async () => {
  const calls: string[] = [];
  const state = {
    id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    status: "active",
    diagnostics: [],
  };
  const dispatch = (phase: "queued" | "terminal") => ({
    build: "build-watch",
    componentPackages: [],
    createdAt: 1,
    availableAt: 1,
    phase,
    ...(phase === "terminal" ? { terminal: "complete" } : {}),
  });
  let statusReads = 0;
  const control = {
    async status() {
      statusReads += 1;
      calls.push("archive.status");
      const terminal = statusReads > 1;
      return {
        build: { build: "build-watch", state },
        catalog: undefined,
        operations: [],
        dispatch: dispatch(terminal ? "terminal" : "queued"),
      };
    },
    async activity() {
      calls.push("archive.activity");
      return { operations: [], dispatch: dispatch("terminal") };
    },
    async close() { calls.push("archive.close"); },
  } as unknown as CliRuntimeArchiveControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openArchive: async () => control,
      controller: async () => ({
        worker: { status: async () => ({ state: "running", profile: path, pid: 1, logPath: "/tmp/worker.log" }) },
      }),
      createRuntime: async () => {
        throw new Error("status must not construct execution Providers");
      },
    }),
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "status", "build-watch", "--runtime", "/tmp/runtime.json", "--watch", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  const result = JSON.parse(output) as {
    readonly build: { readonly id: string; readonly status: string };
    readonly dispatch: { readonly terminal?: string };
  };
  assert.equal(result.build.id, "build-watch");
  assert.equal(result.build.status, "complete");
  assert.equal(result.dispatch.terminal, "complete");
  assert.deepEqual(calls, [
    "archive.status",
    "archive.activity",
    "archive.status",
    "archive.status",
    "archive.close",
  ]);
});

test("command options fail closed instead of being silently ignored", async () => {
  const distribution = {
    openRuntimeHost: async (path: string) => {
      throw new Error(`profile delegated: ${path}`);
    },
  } as unknown as CliDistribution;
  const io = { write() {} };
  await assert.rejects(
    async () => await runCli([
      "status", "build-1", "--runtime", "/tmp/runtime.json", "--workspace", "/tmp",
    ], io, distribution),
    /--workspace does not apply to status/u,
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
      "doctor", "/tmp/runtime.json", "--workspace", "/tmp",
    ], io, distribution),
    /doctor does not compile a Source Workspace; remove --workspace/u,
  );
  await assert.rejects(
    async () => await runCli([
      "queue", "--runtime", "/tmp/narratage.runtime.ts",
    ], io, distribution),
    /profile delegated: .*narratage\.runtime\.ts/u,
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
        ref: { store: "env", key: "KIE_API_KEY" },
        configured: false,
        writable: false,
      }];
    },
    async close() { calls.push("credentials.close"); },
  } as unknown as CliCredentialControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openCredentials: async (endpoint: string) => {
        calls.push(`credentials.create:${endpoint}`);
        return credentials;
      },
      createRuntime: async () => {
        calls.push("execution.create");
        throw new Error("auth must not construct execution");
      },
    }),
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
        ref: { store: "env", key: "KIE_API_KEY" },
        configured: false,
        writable: false,
      }];
    },
    async close() { closed = true; },
  } as unknown as CliCredentialControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openCredentials: async () => credentials,
    }),
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
        terminal: "complete",
      };
    },
    async close() {},
  } as unknown as CliRuntimeArchiveControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openArchive: async () => control,
    }),
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "cancel", "build-complete", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(JSON.parse(output), {
    build: "build-complete",
    requested: false,
    phase: "terminal",
    terminal: "complete",
  });
});
