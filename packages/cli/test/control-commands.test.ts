import assert from "node:assert/strict";
import test from "node:test";

import type { CliDistribution } from "../src/distribution.js";
import { runCli } from "../src/main.js";
import type { CliCredentialControl, CliRuntimeControl } from "../src/runtime-port.js";

test("activity opens Runtime control without constructing execution Providers", async () => {
  const calls: string[] = [];
  const control = {
    async activity() {
      calls.push("control.activity");
      return { builds: [], capacity: [] };
    },
    async close() {
      calls.push("control.close");
    },
  } as unknown as CliRuntimeControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => {
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
    ["activity", "--runtime", "/tmp/hypit-control-profile.json", "--json"],
    { write: (text) => { output += text; } },
    distribution,
  );

  assert.deepEqual(calls, ["control.create", "control.activity", "control.close"]);
  const result = JSON.parse(output) as {
    readonly format: string;
    readonly at: number;
    readonly builds: readonly unknown[];
  };
  assert.equal(result.format, "hypit.cli-activity@1");
  assert.equal(typeof result.at, "number");
  assert.deepEqual(result.builds, []);
});

test("status --watch follows active execution, then reads its finished Result", async () => {
  const calls: string[] = [];
  const resultLocation = {
    root: "/project",
    selection: { use: "@hypit/build-result-fs", config: { path: ".hypit/results" } },
  } as const;
  const view = () => ({
    id: "build-watch",
    createdAt: 1,
    activity: "running" as const,
    cancellationRequested: false,
    targets: [],
    acceptedRecords: 0,
    outstandingCommands: 1,
    operations: [],
  });
  let statusReads = 0;
  const control = {
    async inspect() {
      statusReads += 1;
      calls.push("control.inspect");
      return statusReads === 1 ? view() : undefined;
    },
    async close() { calls.push("control.close"); },
  } as unknown as CliRuntimeControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
      controller: async () => ({
        worker: { status: async () => ({ state: "running", profile: path, pid: 1, logPath: "/tmp/worker.log" }) },
      }),
      createRuntime: async () => {
        throw new Error("status must not construct execution Providers");
      },
    }),
    openProjectResults: async () => ({
      location: resultLocation,
      repository: {
        async read() {
          return {
            format: "hypit.build-result@2",
            id: "build-watch",
            source: { path: "main.svml" },
            targets: [],
            finishedAt: 2,
            outcome: "complete",
            outputs: {},
          };
        },
      },
      async close() {},
    }),
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "status", "build-watch", "--runtime", "/tmp/runtime.json", "--watch", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  const result = JSON.parse(output) as {
    readonly build: { readonly id: string; readonly outcome: string };
  };
  assert.equal(result.build.id, "build-watch");
  assert.equal(result.build.outcome, "complete");
  assert.deepEqual(calls, [
    "control.inspect",
    "control.inspect",
    "control.close",
  ]);
});

test("status reads a finished project Result without a Runtime", async () => {
  const calls: string[] = [];
  const distribution = {
    openRuntimeHost: async () => {
      throw new Error("finished Result lookup must not open a Runtime");
    },
    openProjectResults: async () => ({
      repository: {
        async read(build: string) {
          calls.push(`result.read:${build}`);
          return {
            format: "hypit.build-result@2",
            id: build,
            source: { path: "main.svml" },
            targets: [],
            finishedAt: 2,
            outcome: "complete",
            outputs: {},
          };
        },
      },
      async close() { calls.push("result.close"); },
    }),
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "status", "build-finished", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  const result = JSON.parse(output) as {
    readonly build: { readonly id: string; readonly outcome: string };
  };
  assert.equal(result.build.id, "build-finished");
  assert.equal(result.build.outcome, "complete");
  assert.deepEqual(calls, ["result.read:build-finished", "result.close"]);
});

test("status preserves Runtime decision and attention when its Result Store is unavailable", async () => {
  const view = {
    id: "build-result-unavailable",
    createdAt: 1,
    activity: "saving-result" as const,
    outcome: "failed" as const,
    issue: { scope: "result" as const, message: "S3 unavailable" },
    cancellationRequested: false,
    targets: [],
    acceptedRecords: 0,
    outstandingCommands: 0,
    operations: [],
  };
  const control = {
    async inspect() { return view; },
    async close() {},
  } as unknown as CliRuntimeControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
    }),
    async openProjectResults() { throw new Error("S3 unavailable"); },
  } as unknown as CliDistribution;
  let output = "";
  let exitCode = 0;

  await runCli([
    "status", view.id, "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; }, setExitCode: (code) => { exitCode = code; } }, distribution);

  const result = JSON.parse(output) as {
    readonly build: typeof view;
    readonly resultReadError: string;
  };
  assert.equal(result.build.outcome, "failed");
  assert.equal(result.build.issue.scope, "result");
  assert.equal(result.resultReadError, "S3 unavailable");
  assert.equal(exitCode, 1);
});

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
  const control = {
    async inspect() { return blocked; },
    async close() {},
  } as unknown as CliRuntimeControl;
  const resultControl = {
    async finishResult() {
      finishes += 1;
      return { id: blocked.id, outcome: blocked.outcome };
    },
    async close() {},
  };
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
      openResultControl: async () => resultControl,
      createRuntime: async () => {
        throw new Error("continuing a Result must not construct execution Providers");
      },
    }),
  } as unknown as CliDistribution;
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
  const distribution = {
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
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "result", "discard", "build-submitting", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(calls, ["discard:build-submitting", "result-control.close", "control.close"]);
  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-result-discard@1", build: "build-submitting", discarded: true,
  });
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
      "activity", "--runtime", "/tmp/one.json", "--runtime", "/tmp/two.json",
    ], io, distribution),
    /--runtime cannot be repeated/u,
  );
  await assert.rejects(
    async () => await runCli([
      "doctor", "/tmp/runtime.json", "--workspace", "/tmp",
    ], io, distribution),
    /profile delegated: .*runtime\.json/u,
  );
  await assert.rejects(
    async () => await runCli([
      "activity", "--runtime", "/tmp/hypit.runtime.ts",
    ], io, distribution),
    /profile delegated: .*hypit\.runtime\.ts/u,
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
    async cancel() { return undefined; },
    async close() {},
  } as unknown as CliRuntimeControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
    }),
    openProjectResults: async () => ({
      repository: {
        async read() {
          return {
            format: "hypit.build-result@2",
            id: "build-complete",
            source: { path: "main.svml" },
            targets: [],
            finishedAt: 2,
            outcome: "complete",
            outputs: {},
          };
        },
      },
      async close() {},
    }),
  } as unknown as CliDistribution;
  let output = "";

  await runCli([
    "cancel", "build-complete", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-cancel@2",
    build: "build-complete",
    requested: false,
    outcome: "complete",
  });
});
