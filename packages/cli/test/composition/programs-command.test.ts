import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { runCliApplication } from "../../src/application.js";
import { commandHint } from "../../src/command-hint.js";
import type { CliDistribution } from "../../src/distribution.js";
import type { CliIo } from "../../src/output.js";
import { createLocalRuntimeCliCommandModules } from "../../../runtime-local/src/cli.js";
import type { ManagedProgramProgress as CliManagedProgramProgress, ManagedProgramReport as CliManagedProgramReport } from "../../../runtime-local/src/programs.js";
import type { LocalRuntimeHost, RuntimeController as CliRuntimeController } from "../../../runtime-local/src/host-api.js";
import { cliDistribution } from "../distribution-scenario.js";

const io = { write: () => {} };
const applicationCwd = tmpdir();
const runCli = async (argv: readonly string[], output: CliIo, selected: CliDistribution) =>
  await runCliApplication(argv, output, {
    // This suite mounts the Local Runtime command contribution onto deliberately
    // small Distribution doubles. Assemble its product-specific Host port just
    // as the real video executable does; the generic CLI port remains separate.
    distribution: selected,
    commandModules: createLocalRuntimeCliCommandModules({
      ...(selected.packageRoot === undefined ? {} : { packageRoot: selected.packageRoot }),
      openLocalRuntimeHost: async (path, options) =>
        await selected.openRuntimeHost(path, options) as LocalRuntimeHost,
    }),
    cwd: applicationCwd,
    resolveProjectRoot: async (explicit) => await realpath(explicit ?? tmpdir()),
  });

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
      prepare: async (options) => { calls.push(`prepare ${path} ${JSON.stringify(options)}`); return { dataRoot: "/tmp", programs: reports }; },
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
  return cliDistribution({
    bootstrapPackages: [],
    openRuntimeHost: async (path: string) => ({
      profile: path,
      createRuntime: async () => ({ close: async () => {} }),
      controller: async () => controller(path, calls, reports),
    }),
  });
}

test("programs dispatches lifecycle through the selected Runtime Controller", async () => {
  const calls: string[] = [];
  await runCli(["programs", "up", "/p/hypit.runtime.json", "--max-wait-ms", "1000"], io, distribution(calls));
  await runCli(["programs", "down", "/p/hypit.runtime.json"], io, distribution(calls));
  await runCli(["programs", "status", "/p/hypit.runtime.json"], io, distribution(calls));
  // The CLI resolves the profile it is given, and what resolving produces is the platform's own
  // spelling. Asserting the argument back verbatim would only be asserting that this is POSIX.
  const profile = resolve(applicationCwd, "/p/hypit.runtime.json");
  assert.deepEqual(calls, [
    `up ${profile} {"maxWaitMs":1000}`,
    `down ${profile}`,
    `report ${profile}`,
  ]);
});

test("programs without a Runtime Profile explains how to select one", async () => {
  const projectRoot = await realpath(tmpdir());
  await assert.rejects(
    runCli(["programs", "status", "--project", projectRoot], io, distribution([])),
    /programs requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>/u,
  );
});

test("programs accepts prepare, up, down and status", async () => {
  await assert.rejects(
    runCli(["programs", "restart", "/p/hypit.runtime.json"], io, distribution([])),
    /programs takes prepare, up, down or status/u,
  );
});

test("scoped Program startup receives the explicit Endpoint set", async () => {
  const calls: string[] = [];
  await runCli(
    ["programs", "up", "/p/hypit.runtime.json", "--endpoint", "chosen", "--endpoint", "media"],
    io,
    distribution(calls),
  );
  assert.match(calls[0]!, /"endpoints":\["chosen","media"\]/u);
});

test("program discovery preserves readiness and failed shutdown names the service still running", async () => {
  const reports: CliManagedProgramReport[] = [
    ...Array.from({ length: 25 }, (_, index) => ({ id: `ready-${index}`, endpoint: "chosen", state: { state: "ready" as const } })),
    { id: "needs-help", endpoint: "other", action: "nothing-to-stop", state: { state: "down", detail: "cannot connect" } },
  ];
  let output = "";
  await runCli(["programs", "status", "/tmp/profile.json", "--json", "--limit", "2"], {
    write(text) { output += text; },
  }, distribution([], reports));
  const parsed = JSON.parse(output);
  assert.equal(parsed.programCount, 26);
  assert.equal(parsed.readyCount, 25);
  assert.deepEqual(parsed.programs.map((item: { id: string }) => item.id), ["needs-help", "ready-0"]);
  assert.equal(parsed.omittedPrograms, 24);

  let failure = "";
  let exitCode = 0;
  await runCli(["programs", "down", "/tmp/profile.json", "--limit", "1"], {
    write(text) { failure += text; }, setExitCode(code) { exitCode = code; },
  }, distribution([], reports));
  assert.equal(exitCode, 1);
  assert.match(failure, /ready-24: ready/u);
  assert.doesNotMatch(failure, /needs-help/u);
});

test("waiting belongs only to programs up", async () => {
  await assert.rejects(
    runCli(["programs", "status", "/p/hypit.runtime.json", "--max-wait-ms", "1000"], io, distribution([])),
    /--max-wait-ms applies to programs up/u,
  );
});

test("Local Runtime numeric options use the shared decimal CLI spelling", async () => {
  for (const value of ["", "0x10", "1e3", "-1", "1.5"]) {
    await assert.rejects(
      runCli(["programs", "up", "/p/hypit.runtime.json", "--max-wait-ms", value], io, distribution([])),
      /--max-wait-ms requires a positive integer/u,
      JSON.stringify(value),
    );
  }
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
  assert.match(output, /endpoint speech\.primary/u, "expose the selector accepted by --endpoint");
});

test("a declined stop stays visible even when the service is not Ready", async () => {
  const busy: CliManagedProgramReport = {
    id: "preparing", endpoint: "chosen", action: "unchanged",
    state: { state: "down", detail: "not serving yet" },
    detail: "another command owns this Program's preparation or lifecycle change; inspect its logs",
    installationLogPath: "/tmp/install.log",
  };
  for (const json of [false, true]) {
    let output = "";
    let exitCode: number | undefined;
    await runCli(["programs", "down", "/p/profile.json", "--limit", "1", ...(json ? ["--json"] : [])], {
      write(text) { output += text; }, setExitCode(code) { exitCode = code; },
    }, distribution([], [busy]));
    assert.equal(exitCode, 1);
    if (json) {
      const value = JSON.parse(output);
      assert.equal(value.ok, false);
      assert.equal(value.ready, false);
      assert.equal(value.programs[0].installationLogPath, busy.installationLogPath);
    } else {
      assert.match(output, /stop needs attention/u);
      assert.match(output, /another command owns/u);
      assert.doesNotMatch(output, /External programs stopped/u);
    }
  }
  let output = "";
  await runCli(["programs", "down", "/p/profile.json", "--json"], {
    write(text) { output += text; },
  }, distribution([], [{ id: busy.id, endpoint: busy.endpoint, state: busy.state, action: "nothing-to-stop" }]));
  const stopped = JSON.parse(output);
  assert.equal(stopped.ok, true);
  assert.equal(stopped.ready, false, "a successful stop is not service readiness");
});

test("programs down accepts a ready probe-only Program with nothing to stop", async () => {
  const reports: CliManagedProgramReport[] = [{
    id: "toolchain", endpoint: "media.local", action: "nothing-to-stop", state: { state: "ready" },
  }];
  let human = "";
  await runCli(["programs", "down", "/p/profile.json"], {
    write(text) { human += text; },
  }, distribution([], reports));
  assert.match(human, /No external programs to stop/u);

  let output = "";
  let exitCode: number | undefined;
  await runCli(["programs", "down", "/p/profile.json", "--json"], {
    write(text) { output += text; }, setExitCode(code) { exitCode = code; },
  }, distribution([], reports));
  const stopped = JSON.parse(output);
  assert.equal(exitCode, undefined);
  assert.equal(stopped.ok, true);
  assert.equal(stopped.ready, true);
  assert.equal(stopped.programCount, 1);
  assert.equal(stopped.readyCount, 1);
});

test("Runtime headlines preserve a running Worker when Programs are down or stop fails", async () => {
  const selected = cliDistribution({
    bootstrapPackages: [],
    openRuntimeHost: async () => ({
      controller: async () => ({
        worker: {
          status: async () => ({ state: "running" }),
          down: async () => ({ state: "running" }),
        },
        programs: { report: async () => ({ programs: [{ id: "loading", endpoint: "chosen", state: { state: "down", detail: "loading" }, pid: 12 }] }) },
      }),
      openControl: async () => ({ activity: async () => ({ builds: [], capacity: [] }), close: async () => {} }),
    }),
  });
  for (const action of ["status", "down"]) {
    let output = "";
    let exitCode: number | undefined;
    await runCli(["runtime", action, "/p/profile.json"], {
      write(text) { output += text; }, setExitCode(code) { exitCode = code; },
    }, selected);
    assert.doesNotMatch(output, /Runtime Worker stopped|Runtime Worker is down/u);
    assert.match(output, action === "status" ? /Programs not ready/u : /Worker is still running/u);
    assert.equal(exitCode, action === "status" ? undefined : 1);
  }
});

test("program startup reports actions, not no-op checks", async () => {
  let output = "";
  const selected = cliDistribution({
    bootstrapPackages: [],
    openRuntimeHost: async (path: string) => ({
      profile: path,
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
  });

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
    installationLogPath: "/tmp/local-service/install.log",
    errorLogPath: "/tmp/local-service/program.err.log",
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
        assert.equal(item.installationLogPath, report.installationLogPath);
        assert.equal(item.errorLogPath, report.errorLogPath);
        assert.equal(item.pid, report.pid);
      } else {
        assert.match(output, /health endpoint is not answering/u);
        assert.match(output, /service is still loading/u);
        assert.match(output, /PID 321/u);
        assert.match(output, /\/tmp\/local-service\/program\.log/u);
        assert.match(output, /\/tmp\/local-service\/install\.log/u);
        assert.match(output, /\/tmp\/local-service\/program\.err\.log/u);
      }
    }
  }
});

test("JSON startup keeps live preparation evidence on stderr and one result on stdout", async () => {
  let output = "";
  let progress = "";
  const selected = cliDistribution({
    bootstrapPackages: [],
    openRuntimeHost: async () => ({
      controller: async () => ({
        programs: {
          async up(options: { onProgress?: (event: CliManagedProgramProgress) => void }) {
            options.onProgress?.({ id: "example", phase: "installing", logPath: "/tmp/install.log", detail: "Prepare sentence data" });
            assert.match(progress, /Prepare sentence data.*\/tmp\/install\.log/u);
            assert.equal(output, "", "no partial JSON or progress text reaches stdout");
            return { dataRoot: "/tmp", programs: [{ id: "example", endpoint: "example", state: { state: "ready" } }] };
          },
        },
      }),
    }),
  });
  await runCli(["programs", "up", "/project/profile.json", "--json"], {
    write(text) { output += text; },
    writeProgress(text) { progress += text; },
  }, selected);
  assert.equal(JSON.parse(output).readyCount, 1);
});

test("runtime up validates the Runtime before it starts Programs", async () => {
  const calls: string[] = [];
  const base = distribution(calls);
  const selected = cliDistribution({
    ...base,
    openRuntimeHost: async (path: string) => ({
      profile: path,
      controller: async () => controller(path, calls),
      createRuntime: async () => { throw new Error("Runtime Profile conflict"); },
    }),
  });
  await assert.rejects(
    runCli(["runtime", "up", "/p/hypit.runtime.json"], io, selected),
    /Runtime Profile conflict/u,
  );
  assert.deepEqual(calls, []);
});

test("runtime status keeps scheduling phases out of the default view", async () => {
  let output = "";
  const selected = cliDistribution({
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
  });

  await runCli(["runtime", "status", "/project/hypit.runtime.json"], {
    write(text) { output += text; },
  }, selected);

  assert.match(output, /Local Runtime ready/u);
  assert.match(output, /Active Builds\s+0/u);
  assert.doesNotMatch(output, /\bStarting\b|\bWaiting\b|\bDecided\b|Running turn|Capacity in use/u);
});

test("Worker stop suggests Program control in the same project and Profile", async () => {
  const projectRoot = await realpath(tmpdir());
  const runtimeProfile = resolve("/tmp/a selected profile.json");
  let output = "";
  await runCli(["runtime", "down", "--project", projectRoot, "--runtime", runtimeProfile], {
    write(text) { output += text; },
  }, distribution([]));
  assert.ok(output.includes(commandHint(["programs", "down"], { projectRoot, runtimeProfile })));
  assert.match(output, /Managed Programs are unchanged/u);
  assert.doesNotMatch(output, /were left running/u);
});


test("programs prepare provisions resources through the controller without starting a worker", async () => {
  const calls: string[] = [];
  await runCli(["programs", "prepare", "/p/hypit.runtime.json", "--endpoint", "speech"], io, distribution(calls));
  assert.deepEqual(calls, [`prepare ${resolve(applicationCwd, "/p/hypit.runtime.json")} {"endpoints":["speech"]}`]);
});
