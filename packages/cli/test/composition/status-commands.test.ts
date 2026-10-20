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
import { applicationCwd, runCli } from "./control-command-scenario.js";

test("activity opens Runtime control without constructing execution Providers", async () => {
  const calls: string[] = [];
  const control = runtimeControl({
    async activity() {
      calls.push("control.activity");
      return { builds: [], capacity: [] };
    },
    async close() {
      calls.push("control.close");
    },
  });
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => {
        calls.push("control.create");
        return control;
      },
      executionStatus: async () => ({ state: "stopped" as const }),
      controller: async () => ({
        worker: { status: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }) },
      }),
      createRuntime: async () => {
        calls.push("execution.create");
        throw new Error("execution Providers must not be constructed");
      },
    }),
  });
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

test("doctor retains later errors even with a small display limit", async () => {
  const diagnostics = Array.from({ length: 25 }, (_, index) => ({
    severity: "warning" as const, code: `NOTICE_${index}`, message: "setup note",
  }));
  const selected = cliDistribution({ diagnoseProjectResults: async () => ({ diagnostics: [
    ...diagnostics, { severity: "error", code: "BROKEN_RESULT", message: "selected repository unavailable" },
  ] }) });
  let output = "";
  let exitCode = 0;
  await runCli(["doctor", "--project", tmpdir(), "--limit", "1", "--json"], {
    write(text) { output += text; }, setExitCode(code) { exitCode = code; },
  }, selected);
  assert.equal(exitCode, 1);
  assert.equal(JSON.parse(output).diagnostics.at(-1).code, "BROKEN_RESULT");
});

test("finished status reports failure details and a nonzero exit without a Runtime", async () => {
  const selected = cliDistribution({ openProjectResults: async () => ({
    repository: { read: async () => ({ id: "failed", outcome: "failed", targets: [], outputs: {}, failure: "renderer exited", operations: [] }) },
    close() {},
  }) });
  let output = "";
  let exitCode = 0;
  await runCli(["status", "failed", "--project", tmpdir()], {
    write(text) { output += text; }, setExitCode(code) { exitCode = code; },
  }, selected);
  assert.equal(exitCode, 1);
  assert.match(output, /renderer exited/u);
});

test("status --watch follows active execution, then reads its finished Result", async () => {
  const calls: string[] = [];
  const resultLocation = {
    root: "/project",
    path: ".hypit/results",
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
  const control = runtimeControl({
    async inspect() {
      statusReads += 1;
      calls.push("control.inspect");
      return statusReads === 1 ? view() : undefined;
    },
    async close() { calls.push("control.close"); },
  });
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
      executionStatus: async () => ({ state: "running" as const }),
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
            format: "hypit.build-result@1",
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
  });
  let output = "";

  let progress = "";
  await runCli([
    "status", "build-watch", "--runtime", "/tmp/runtime.json", "--watch", "--json",
  ], {
    write: (text) => { output += text; },
    writeProgress: (text) => { progress += text; },
  }, distribution);
  assert.match(progress, /Working/u);

  const result = JSON.parse(output) as {
    readonly build: { readonly id: string; readonly work: { readonly outcome: string }; readonly result: { readonly state: string } };
  };
  assert.equal(result.build.id, "build-watch");
  assert.equal(result.build.work.outcome, "complete");
  assert.equal(result.build.result.state, "complete");
  assert.deepEqual(calls, [
    "control.inspect",
    "control.inspect",
    "control.close",
  ]);
});

test("status reads a finished project Result without a Runtime", async () => {
  const calls: string[] = [];
  const distribution = cliDistribution({
    openRuntimeHost: async () => {
      throw new Error("finished Result lookup must not open a Runtime");
    },
    openProjectResults: async () => ({
      repository: {
        async read(build: string) {
          calls.push(`result.read:${build}`);
          return {
            format: "hypit.build-result@1",
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
  });
  let output = "";

  await runCli([
    "status", "build-finished", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  const result = JSON.parse(output) as {
    readonly build: { readonly id: string; readonly work: { readonly outcome: string }; readonly result: { readonly state: string } };
  };
  assert.equal(result.build.id, "build-finished");
  assert.equal(result.build.work.outcome, "complete");
  assert.equal(result.build.result.state, "complete");
  assert.deepEqual(calls, ["result.read:build-finished", "result.close"]);
});

test("finished status defaults to the Result outcome without repeating internal layers", async () => {
  const distribution = cliDistribution({
    openProjectResults: async () => ({
      repository: {
        async read() {
          return {
            format: "hypit.build-result@1",
            id: "build-finished",
            source: { path: "main.svml" },
            targets: ["final.video"],
            finishedAt: 2,
            outcome: "complete",
            outputs: { "final.video": {} },
          };
        },
      },
      async close() {},
    }),
  });
  let output = "";

  await runCli(["status", "build-finished"], {
    write(text) { output += text; },
  }, distribution);

  assert.match(output, /Build complete/u);
  assert.match(output, /Outcome\s+complete/u);
  assert.doesNotMatch(output, /\bWork\b|\bDecision\b|\bResult\s+complete/u);
});

test("status separates execution from Result only while the Result is being saved", async () => {
  const view = {
    id: "build-saving",
    createdAt: 1,
    activity: "saving-result" as const,
    outcome: "complete" as const,
    cancellationRequested: false,
    targets: ["final.video"],
    acceptedRecords: 1,
    outstandingCommands: 0,
    operations: [],
  };
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => ({ async inspect() { return view; }, async close() {} }),
    }),
    openProjectResults: async () => ({
      repository: { async read() { return undefined; } },
      async close() {},
    }),
  });
  let output = "";

  await runCli(["status", view.id, "--runtime", "/tmp/runtime.json"], {
    write(text) { output += text; },
  }, distribution);

  assert.match(output, /Saving Build Result/u);
  assert.match(output, /Execution\s+complete/u);
  assert.match(output, /Result\s+saving/u);
  assert.doesNotMatch(output, /Build complete|Outcome\s+complete/u);
});

test("status preserves Runtime decision and attention when its Result Store is unavailable", async () => {
  const view = {
    id: "build-result-unavailable",
    createdAt: 1,
    activity: "saving-result" as const,
    outcome: "failed" as const,
    issue: { scope: "result" as "result" | "cleanup", message: "S3 unavailable" },
    cancellationRequested: false,
    targets: [],
    acceptedRecords: 0,
    outstandingCommands: 0,
    operations: [{ id: "operation:failed", endpoint: "images.internal", status: "failed" as const,
      failure: { code: "REMOTE", message: "provider detail" } }],
  };
  const control = runtimeControl({
    async inspect() { return view; },
    async close() {},
  });
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
    }),
    async openProjectResults() { throw new Error("S3 unavailable"); },
  });
  let output = "";
  let exitCode = 0;

  await runCli([
    "status", view.id, "--project", tmpdir(), "--runtime", "/tmp/runtime with space.json", "--json",
  ], { write: (text) => { output += text; }, setExitCode: (code) => { exitCode = code; } }, distribution);

  const result = JSON.parse(output) as {
    readonly build: {
      readonly work: { readonly outcome: string };
      readonly result: { readonly state: string };
      readonly attention: { readonly message: string; readonly action: string };
    };
  };
  assert.equal(result.build.work.outcome, "failed");
  assert.equal(result.build.result.state, "unavailable");
  assert.equal(result.build.attention.message, "S3 unavailable");
  assert.equal(result.build.attention.action, commandHint(["result", "finish", view.id], {
    projectRoot: await realpath(applicationCwd), runtimeProfile: resolve(applicationCwd, "/tmp/runtime with space.json"),
  }));
  assert.deepEqual((result.build as { operations?: unknown }).operations, [{
    endpoint: "images.internal", state: "failed", failure: { code: "REMOTE", message: "provider detail" },
  }]);
  assert.equal(exitCode, 1);
  view.issue = { scope: "cleanup", message: "temporary resource cleanup unavailable" };
  output = "";
  await runCli([
    "status", view.id, "--project", tmpdir(), "--runtime", "/tmp/runtime with space.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);
  const cleanup = JSON.parse(output).build.attention;
  assert.equal(cleanup.message, "temporary resource cleanup unavailable");
  assert.equal(cleanup.action, result.build.attention.action);
});


test("command options fail closed instead of being silently ignored", async () => {
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => {
      throw new Error(`profile delegated: ${path}`);
    },
  });
  const io = { write() {} };
  await assert.rejects(
    async () => await runCli([
      "status", "build-1", "--runtime", "/tmp/runtime.json", "--asset-root", "/tmp",
    ], io, distribution),
    /--asset-root does not apply to status/u,
  );
  await assert.rejects(
    async () => await runCli([
      "activity", "--runtime", "/tmp/one.json", "--runtime", "/tmp/two.json",
    ], io, distribution),
    /--runtime cannot be repeated/u,
  );
  await assert.rejects(
    async () => await runCli([
      "activity", "--runtime", "/tmp/runtime.json", "--watch", "--json", "--jsonl",
    ], io, distribution),
    /use --jsonl instead of --json/u,
  );
  await assert.rejects(
    async () => await runCli([
      "doctor", "/tmp/runtime.json", "--project", tmpdir(),
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

test("doctor diagnoses project Results without requiring a Runtime Profile", async (t) => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "hypit-doctor-project-")));
  t.after(async () => await rm(projectRoot, { recursive: true, force: true }));
  const calls: string[] = [];
  const distribution = cliDistribution({
    async diagnoseProjectResults(projectRoot: string) {
      calls.push(`results:${projectRoot}`);
      return { diagnostics: [] };
    },
    async openRuntimeHost() {
      calls.push("runtime");
      throw new Error("doctor without a Profile must not open a Runtime");
    },
  });
  let output = "";
  await runCli(["doctor", "--project", projectRoot, "--json"], {
    write(text) { output += text; },
  }, distribution);
  assert.deepEqual(calls, [`results:${projectRoot}`]);
  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-doctor@1",
    ok: true,
    project: projectRoot,
    profileSource: "none",
    diagnosticCount: 0,
    diagnostics: [],
  });
});


test("cancelling a completed Build reports that no cancellation was requested", async () => {
  const control = runtimeControl({
    async cancel() { return undefined; },
    async close() {},
  });
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => control,
    }),
    openProjectResults: async () => ({
      repository: {
        async read() {
          return {
            format: "hypit.build-result@1",
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
  });
  let output = "";

  await runCli([
    "cancel", "build-complete", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-cancel@1",
    requested: false,
    build: {
      id: "build-complete",
      targets: [],
      work: { state: "done", outcome: "complete" },
      result: { state: "complete", outputCount: 0 },
    },
  });
});

test("cancelling an already failed execution preserves and reports its stop reason", async () => {
  const stop = { cause: "execution-failed", reason: "Original execution failure" } as const;
  const active = {
    id: "build-stopping", createdAt: 1, activity: "waiting", cancellationRequested: false, stop,
    targets: [], acceptedRecords: 0, outstandingCommands: 0, operations: [],
  } as const;
  const control = runtimeControl({ async cancel() { return active; }, async close() {} });
  const distribution = cliDistribution({
    openRuntimeHost: async (path: string) => ({ profile: path, openControl: async () => control }),
  });
  let output = "";
  await runCli(["cancel", "build-stopping", "--runtime", "/tmp/runtime.json", "--json"],
    { write: (text) => { output += text; } }, distribution);
  const result = JSON.parse(output);
  assert.equal(result.requested, false);
  assert.deepEqual(result.build.work.stop, stop);
  output = "";
  await runCli(["cancel", "build-stopping", "--runtime", "/tmp/runtime.json"],
    { write: (text) => { output += text; } }, distribution);
  assert.match(output, /already stopping after failure/);
  assert.match(output, /Original execution failure/);
});

test("a stopped Worker ends observation with scoped evidence commands, not a Result-read failure", async () => {
  const projectRoot = await realpath(tmpdir());
  const runtimeProfile = resolve("/tmp/selected runtime.json");
  let closed = false;
  let resultOpened = false;
  const selected = cliDistribution({
    openRuntimeHost: async () => ({
      openControl: async () => ({
        inspect: async () => ({
          id: "waiting-build", createdAt: Date.now(), activity: "waiting", cancellationRequested: false,
          targets: [], acceptedRecords: 0, outstandingCommands: 1, operations: [],
        }),
        close() { closed = true; },
      }),
      executionStatus: async () => ({ state: "stopped" as const }),
    }),
    openProjectResults: async () => { resultOpened = true; throw new Error("must not be mistaken for result storage"); },
  });
  await assert.rejects(runCli([
    "status", "waiting-build", "--project", projectRoot, "--runtime", runtimeProfile, "--watch", "--json",
  ], { write() {} }, selected), (error: Error) => {
    assert.match(error.message, /Runtime execution is stopped; stopped watching Build waiting-build/u);
    assert.ok(error.message.includes(commandHint(["runtime", "status"], { projectRoot, runtimeProfile })));
    assert.ok(error.message.includes(commandHint(["logs", "waiting-build"], { projectRoot, runtimeProfile })));
    return true;
  });
  assert.equal(closed, true);
  assert.equal(resultOpened, false);
});
