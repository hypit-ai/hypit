import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { CliDistribution } from "../src/distribution.js";
import { runCli } from "../src/main.js";
import type { CliCredentialControl, CliRuntimeControl } from "../src/runtime-port.js";
import { commandHint } from "../src/command-hint.js";

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

test("doctor retains later errors even with a small display limit", async () => {
  const diagnostics = Array.from({ length: 25 }, (_, index) => ({
    severity: "warning" as const, code: `NOTICE_${index}`, message: "setup note",
  }));
  const selected = { diagnoseProjectResults: async () => ({ diagnostics: [
    ...diagnostics, { severity: "error", code: "BROKEN_RESULT", message: "selected repository unavailable" },
  ] }) } as unknown as CliDistribution;
  let output = "";
  let exitCode = 0;
  await runCli(["doctor", "--workspace", tmpdir(), "--limit", "1", "--json"], {
    write(text) { output += text; }, setExitCode(code) { exitCode = code; },
  }, selected);
  assert.equal(exitCode, 1);
  assert.equal(JSON.parse(output).diagnostics.at(-1).code, "BROKEN_RESULT");
});

test("finished status reports failure details and a nonzero exit without a Runtime", async () => {
  const selected = { openProjectResults: async () => ({
    repository: { read: async () => ({ id: "failed", outcome: "failed", targets: [], outputs: {}, failure: "renderer exited", operations: [] }) },
    close() {},
  }) } as unknown as CliDistribution;
  let output = "";
  let exitCode = 0;
  await runCli(["status", "failed", "--workspace", tmpdir()], {
    write(text) { output += text; }, setExitCode(code) { exitCode = code; },
  }, selected);
  assert.equal(exitCode, 1);
  assert.match(output, /renderer exited/u);
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
  } as unknown as CliDistribution;
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
  const distribution = {
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
  } as unknown as CliDistribution;
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
  const distribution = {
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
  } as unknown as CliDistribution;
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
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      openControl: async () => ({ async inspect() { return view; }, async close() {} }),
    }),
    openProjectResults: async () => ({
      repository: { async read() { return undefined; } },
      async close() {},
    }),
  } as unknown as CliDistribution;
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
    operations: [{ endpoint: "images.internal", status: "failed" as const,
      failure: { code: "REMOTE", message: "provider detail" } }],
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
    "status", view.id, "--workspace", tmpdir(), "--runtime", "/tmp/runtime with space.json", "--json",
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
    projectRoot: await realpath(tmpdir()), runtimeProfile: resolve("/tmp/runtime with space.json"),
  }));
  assert.deepEqual((result.build as { operations?: unknown }).operations, [{
    endpoint: "images.internal", state: "failed", failure: { code: "REMOTE", message: "provider detail" },
  }]);
  assert.equal(exitCode, 1);
  view.issue = { scope: "cleanup", message: "temporary resource cleanup unavailable" };
  output = "";
  await runCli([
    "status", view.id, "--workspace", tmpdir(), "--runtime", "/tmp/runtime with space.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);
  const cleanup = JSON.parse(output).build.attention;
  assert.equal(cleanup.message, "temporary resource cleanup unavailable");
  assert.equal(cleanup.action, result.build.attention.action);
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

  assert.deepEqual(calls, ["discard:build-submitting", "result-control.close"]);
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
      "doctor", "/tmp/runtime.json", "--workspace", tmpdir(),
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
  const distribution = {
    async diagnoseProjectResults(projectRoot: string) {
      calls.push(`results:${projectRoot}`);
      return { diagnostics: [] };
    },
    async openRuntimeHost() {
      calls.push("runtime");
      throw new Error("doctor without a Profile must not open a Runtime");
    },
  } as unknown as CliDistribution;
  let output = "";
  await runCli(["doctor", "--workspace", projectRoot, "--json"], {
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

test("auth opens only one Endpoint credential control, never the execution Runtime", async () => {
  const calls: string[] = [];
  const credentials = {
    async credentials(endpoint?: string) {
      calls.push(`credentials.status:${endpoint}`);
      return [{
        endpoint: "images.project",
        slot: "apiKey",
        label: "Image service API key",
        kind: "secret",
        ref: { store: "env", key: "IMAGE_API_KEY" },
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
    "auth", "status", "images.project", "--runtime", "/tmp/runtime.json", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(calls, [
    "credentials.create:images.project",
    "credentials.status:images.project",
    "credentials.close",
  ]);
  assert.equal((JSON.parse(output) as { readonly endpoint?: string }).endpoint, "images.project");
  const machine = JSON.parse(output) as { readonly credentials: readonly Record<string, unknown>[] };
  assert.equal("ref" in machine.credentials[0]!, false);
  assert.equal("key" in machine.credentials[0]!, false);
});

test("auth status exposes declared acquisition without acquiring or revealing credentials", async () => {
  const acquisition = {
    kind: "oauth2-pkce", authorizationEndpoint: "https://service.example/authorize",
    tokenEndpoint: "https://service.example/token", clientId: "example-client", scopes: ["inference"],
  };
  const distribution = {
    openRuntimeHost: async () => ({
      openCredentials: async () => ({
        credentials: async () => [
          { endpoint: "service.project", slot: "browser", label: "Service access", kind: "secret",
            configured: false, writable: true, ref: { store: "os", key: "private-reference" }, acquisition,
            secret: "not-for-display" },
          { endpoint: "service.project", slot: "key", label: "Service key", kind: "secret",
            configured: false, writable: true, ref: { store: "os", key: "private-reference" } },
          { endpoint: "service.project", slot: "external", label: "External key", kind: "secret",
            configured: false, writable: false, ref: { store: "env", key: "PRIVATE_KEY" } },
          { endpoint: "service.project", slot: "damaged", label: "Damaged key", kind: "secret",
            configured: false, writable: true, ref: { store: "file", key: "private-reference" },
            detail: "file CredentialStore document /state/credentials/9f2.json is not valid JSON" },
        ],
        putCredential: async () => { throw new Error("Status must not acquire a credential"); },
        close() {},
      }),
      createRuntime: async () => { throw new Error("Status must not start execution"); },
    }),
  } as unknown as CliDistribution;
  for (const json of [true, false]) {
    let output = "";
    await runCli(["auth", "status", "service.project", "--runtime", "/tmp/runtime.json", ...(json ? ["--json"] : [])], {
      write: (text) => { output += text; },
      readSecret: async () => { throw new Error("Status must not request user input"); },
    }, distribution);
    assert.doesNotMatch(output, /not-for-display|private-reference|PRIVATE_KEY|example-client/u);
    if (json) {
      const view = JSON.parse(output);
      assert.equal(view.format, "hypit.cli-auth-status@1");
      assert.deepEqual(view.credentials[0].acquisition, {
        kind: "oauth2-pkce", authorizationEndpoint: "https://service.example/authorize",
      });
      assert.equal(view.credentials[1].acquisition, undefined);
      assert.equal(view.credentials[2].writable, false);
      assert.equal(view.credentials[0].detail, undefined);
      assert.equal(view.credentials[3].detail, "file CredentialStore document /state/credentials/9f2.json is not valid JSON");
    } else {
      assert.match(output, /login opens OAuth: https:\/\/service.example\/authorize/u);
      assert.match(output, /login uses secure secret input/u);
      assert.match(output, /managed by its external credential source/u);
      assert.match(output, /damaged: unreadable — file CredentialStore document \/state\/credentials\/9f2\.json is not valid JSON/u);
    }
  }
});

test("runtime logs returns only the requested tail and hides its path by default", async () => {
  const distribution = {
    openRuntimeHost: async (path: string) => ({
      profile: path,
      controller: async () => ({
        worker: {
          logs: async () => ({ path: "/private/runtime.log", text: "one\ntwo\nthree\n" }),
        },
      }),
    }),
  } as unknown as CliDistribution;
  let output = "";
  await runCli([
    "runtime", "logs", "/tmp/runtime.json", "--lines", "2", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-runtime-logs@1",
    lines: ["two", "three"],
    totalLines: 3,
    omittedLines: 1,
  });
});

test("auth login explains an environment-owned credential before asking for a secret", async () => {
  let prompted = false;
  let closed = false;
  const credentials = {
    async credentials() {
      return [{
        endpoint: "images.project",
        slot: "apiKey",
        label: "Image service API key",
        kind: "secret",
        ref: { store: "env", key: "IMAGE_API_KEY" },
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
      "auth", "login", "images.project", "--runtime", "/tmp/runtime.json",
    ], {
      write() {},
      readSecret: async () => {
        prompted = true;
        return "must-not-be-read";
      },
    }, distribution),
    /cannot be written.*set IMAGE_API_KEY/u,
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
  } as unknown as CliDistribution;
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
  const control = { async cancel() { return active; }, async close() {} } as unknown as CliRuntimeControl;
  const distribution = {
    openRuntimeHost: async (path: string) => ({ profile: path, openControl: async () => control }),
  } as unknown as CliDistribution;
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
  const selected = {
    openRuntimeHost: async () => ({
      openControl: async () => ({
        inspect: async () => ({
          id: "waiting-build", createdAt: Date.now(), activity: "waiting", cancellationRequested: false,
          targets: [], acceptedRecords: 0, outstandingCommands: 1, operations: [],
        }),
        close() { closed = true; },
      }),
      controller: async () => ({ worker: {
        status: async () => ({ state: "stopped", profile: runtimeProfile, logPath: "/tmp/worker.log" }),
      } }),
    }),
    openProjectResults: async () => { resultOpened = true; throw new Error("must not be mistaken for result storage"); },
  } as unknown as CliDistribution;
  await assert.rejects(runCli([
    "status", "waiting-build", "--workspace", projectRoot, "--runtime", runtimeProfile, "--watch", "--json",
  ], { write() {} }, selected), (error: Error) => {
    assert.match(error.message, /Runtime Worker is stopped; stopped watching Build waiting-build/u);
    assert.ok(error.message.includes(commandHint(["runtime", "status"], { projectRoot, runtimeProfile })));
    assert.ok(error.message.includes(commandHint(["logs", "waiting-build"], { projectRoot, runtimeProfile })));
    return true;
  });
  assert.equal(closed, true);
  assert.equal(resultOpened, false);
});
