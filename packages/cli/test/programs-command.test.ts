import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { runCli } from "../src/main.js";
import type { CliDistribution } from "../src/distribution.js";
import type { CliManagedProgramReport, CliRuntimeController } from "../src/runtime-port.js";

const io = { write: () => {} };

function controller(
  path: string,
  calls: string[],
  reports: readonly CliManagedProgramReport[] = [],
): CliRuntimeController {
  const worker = { state: "stopped" as const, profile: path, logPath: "/tmp/worker.log" };
  return {
    profile: path,
    dataRoot: "/tmp",
    worker: {
      up: async () => worker,
      status: async () => worker,
      logs: async () => ({ path: worker.logPath, text: "" }),
      down: async () => worker,
    },
    programs: {
      up: async (options) => {
        calls.push(`up ${path} ${JSON.stringify(options)}`);
        return { dataRoot: "/tmp", programs: reports };
      },
      down: async () => { calls.push(`down ${path}`); return { dataRoot: "/tmp", programs: reports }; },
      report: async () => { calls.push(`report ${path}`); return { dataRoot: "/tmp", programs: reports }; },
    },
  };
}

function distribution(calls: string[], reports: readonly CliManagedProgramReport[] = []): CliDistribution {
  return {
    bootstrapPackages: [],
    openRuntimeHost: async (path: string) => ({
      profile: path,
      prepare: async () => [],
      createRuntime: async () => ({ close: async () => {} }),
      controller: async () => controller(path, calls, reports),
    }),
  } as unknown as CliDistribution;
}

test("programs dispatches lifecycle through the selected Runtime Controller", async () => {
  const calls: string[] = [];
  await runCli(["programs", "up", "/p/hypit.runtime.json", "--max-wait-ms", "1000"], io, distribution(calls));
  await runCli(["programs", "down", "/p/hypit.runtime.json"], io, distribution(calls));
  await runCli(["programs", "status", "/p/hypit.runtime.json"], io, distribution(calls));
  // The CLI resolves the profile it is given, and what resolving produces is the platform's own
  // spelling. Asserting the argument back verbatim would only be asserting that this is POSIX.
  const profile = resolve("/p/hypit.runtime.json");
  assert.deepEqual(calls, [
    `up ${profile} {"maxWaitMs":1000}`,
    `down ${profile}`,
    `report ${profile}`,
  ]);
});

test("programs accepts only up, down and status", async () => {
  await assert.rejects(
    runCli(["programs", "restart", "/p/hypit.runtime.json"], io, distribution([])),
    /programs takes up, down or status/u,
  );
});

test("waiting belongs only to programs up", async () => {
  await assert.rejects(
    runCli(["programs", "status", "/p/hypit.runtime.json", "--max-wait-ms", "1000"], io, distribution([])),
    /--max-wait-ms applies to programs up/u,
  );
});

test("program status may report down without failing the observation", async () => {
  let output = "";
  let exitCode: number | undefined;
  await runCli(["programs", "status", "/project/hypit.runtime.json"], {
    write(text) { output += text; },
    setExitCode(code) { exitCode = code; },
  }, distribution([], [{
    id: "speech-evidence.local",
    endpoint: "speech.primary",
    state: { state: "down", detail: "not running" },
  }]));
  assert.equal(exitCode, undefined);
  assert.match(output, /speech-evidence\.local: down/u);
});

test("program startup reports actions, not no-op checks", async () => {
  let output = "";
  const selected = {
    bootstrapPackages: [],
    openRuntimeHost: async (path: string) => ({
      profile: path,
      prepare: async () => [],
      controller: async () => ({
        worker: {},
        programs: {
          async up(options: { readonly onProgress?: (event: { readonly id: string; readonly phase: "checking" | "starting" | "waiting" | "ready"; readonly logPath?: string }) => void }) {
            options.onProgress?.({ id: "example", phase: "checking" });
            options.onProgress?.({ id: "example", phase: "starting", logPath: "/tmp/example/program.log" });
            options.onProgress?.({ id: "example", phase: "waiting" });
            options.onProgress?.({ id: "example", phase: "ready" });
            return { dataRoot: "/tmp", programs: [{ id: "example", endpoint: "example", state: { state: "ready" } }] };
          },
        },
      }),
    }),
  } as unknown as CliDistribution;

  await runCli(["programs", "up", "/project/hypit.runtime.json"], {
    write(text) { output += text; },
  }, selected);

  assert.match(output, /· Starting example/u);
  assert.match(output, /log \/tmp\/example\/program\.log/u);
  assert.match(output, /External programs ready/u);
  assert.doesNotMatch(output, /· (?:Checking|Waiting for|Ready) example/u);
});

test("programs and runtime startup retain failure evidence in human and JSON output", async () => {
  const report: CliManagedProgramReport = {
    id: "local-service",
    endpoint: "selected.local",
    action: "unchanged",
    state: { state: "down", detail: "health endpoint is not answering" },
    detail: "service is still loading",
    pid: 321,
    logPath: "/tmp/local-service/program.log",
  };
  for (const command of ["programs", "runtime"]) {
    for (const json of [false, true]) {
      let output = "";
      let exitCode: number | undefined;
      await runCli([command, "up", "/project/hypit.runtime.json", ...(json ? ["--json"] : [])], {
        write(text) { output += text; },
        setExitCode(code) { exitCode = code; },
      }, distribution([], [report]));
      assert.equal(exitCode, 1);
      if (json) {
        const parsed = JSON.parse(output);
        const item = command === "programs" ? parsed.programs[0] : parsed.programs.items[0];
        assert.equal(item.state, "down");
        assert.equal(item.stateDetail, report.state.state === "ready" ? undefined : report.state.detail);
        assert.equal(item.endpoint, report.endpoint);
        assert.equal(item.detail, report.detail);
        assert.equal(item.logPath, report.logPath);
        assert.equal(item.pid, report.pid);
      } else {
        assert.match(output, /health endpoint is not answering/u);
        assert.match(output, /service is still loading/u);
        assert.match(output, /PID 321/u);
        assert.match(output, /\/tmp\/local-service\/program\.log/u);
      }
    }
  }
});

test("runtime up validates the Runtime before it starts Programs", async () => {
  const calls: string[] = [];
  const base = distribution(calls);
  const selected = {
    ...base,
    openRuntimeHost: async (path: string) => ({
      profile: path,
      prepare: async () => [],
      controller: async () => controller(path, calls),
      createRuntime: async () => { throw new Error("Runtime Profile conflict"); },
    }),
  } as unknown as CliDistribution;
  await assert.rejects(
    runCli(["runtime", "up", "/p/hypit.runtime.json"], io, selected),
    /Runtime Profile conflict/u,
  );
  assert.deepEqual(calls, []);
});

test("runtime status keeps scheduling phases out of the default view", async () => {
  let output = "";
  const selected = {
    bootstrapPackages: [],
    openRuntimeHost: async (path: string) => ({
      profile: path,
      controller: async () => ({
        worker: { status: async () => ({ state: "running", profile: path, logPath: "/tmp/worker.log" }) },
        programs: { report: async () => ({
          dataRoot: "/tmp",
          programs: [{ id: "renderer", endpoint: "renderer", state: { state: "ready" } }],
        }) },
      }),
      openControl: async () => ({
        activity: async () => ({ builds: [], capacity: [] }),
        close: async () => {},
      }),
    }),
  } as unknown as CliDistribution;

  await runCli(["runtime", "status", "/project/hypit.runtime.json"], {
    write(text) { output += text; },
  }, selected);

  assert.match(output, /Local Runtime ready/u);
  assert.match(output, /Active Builds\s+0/u);
  assert.doesNotMatch(output, /\bStarting\b|\bWaiting\b|\bDecided\b|Running turn|Capacity in use/u);
});
