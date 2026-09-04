import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { createRuntimeEndpointAdapterFacet, RuntimeAdapterRegistry } from "@hypit/runtime-kit";
import type { ManagedProgram, ManagedProgramCommand } from "@hypit/runtime-kit";
import type { CapabilityRef } from "@hypit/protocol";

import {
  bringManagedProgramsUp,
  declaredManagedPrograms,
  reportManagedPrograms,
  takeManagedProgramsDown,
} from "@hypit/runtime-local";

const requiredCapability = {
  module: { name: "example.capabilities", version: "1" },
  name: "Required",
} as const satisfies CapabilityRef;

/**
 * A stand-in program, written in the interpreter already running this file.
 *
 * These fixtures used to be `sh -c` strings. That cost them a shell twice over: `sh` is not on a
 * Windows machine by default, and where it is, a temporary path interpolated into the command
 * string arrives with its backslashes eaten, so the marker file was written somewhere nobody
 * looked and the wait timed out instead of failing. Node is here by definition, and takes its
 * arguments as arguments rather than as text to be parsed a second time.
 */
function nodeProgram(source: string, ...args: readonly string[]): ManagedProgramCommand {
  return { command: process.execPath, args: ["-e", source, ...args] };
}

/** Stay up until something stops us, the way a real service does. */
const STAY_ALIVE = "setInterval(() => {}, 1000);";

/**
 * A stand-in program: `start` writes a file and sleeps, and the probe reads that
 * file back. That is enough to exercise detaching, the pid file, waiting for
 * ready, and stopping — without a Python environment.
 */
async function project(program: (root: string) => ManagedProgram) {
  const root = await mkdtemp(join(tmpdir(), "hypit-programs-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "hypit.runtime-local@1",
    dataRoot: ".",
    credentials: {},
    endpoints: {
      one: { use: "example.program", pool: "example.local", config: {} },
    },
  }));
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.program",
    activate: (context) => ({
      endpoint: {
        name: context.instance,
        manifest: { facets: [] },
        instance: { id: context.instance },
        offers: [{
          capability: requiredCapability,
          returns: { module: { name: "example.values", version: "1" }, name: "Value" },
          endpoint: context.instance,
        }],
        credentials: [],
        install() {},
      } as never,
      program: program(root),
    }),
  }));
  return { root, path, options: { registry } };
}

test("a Build capability selection ignores unrelated Programs", async () => {
  let probes = 0;
  const configured = await project(() => ({
    id: "unused",
    async probe() {
      probes += 1;
      return { state: "ready" as const };
    },
  }));
  const result = await bringManagedProgramsUp(configured.path, {
    ...configured.options,
    capabilities: [{
      module: { name: "another.capabilities", version: "1" },
      name: "Other",
    }],
  });
  assert.deepEqual(result.programs, []);
  assert.equal(probes, 0);
});

test("an empty Build capability set loads no Runtime Adapter packages", async () => {
  const configured = await project(() => ({
    id: "must-not-load",
    async probe() {
      throw new Error("an empty capability set must not activate or probe an Endpoint");
    },
  }));
  const result = await declaredManagedPrograms(configured.path, {
    // Deliberately omit the registry. Reaching adapter activation would fail
    // because no installed package provides `example.program`.
    capabilities: [],
  });
  assert.deepEqual(result, { dataRoot: configured.root, programs: [] });
});

function fileBackedProgram(marker: string): ManagedProgram {
  return {
    id: "example",
    start: nodeProgram(`require("node:fs").writeFileSync(process.argv[1], "ready"); ${STAY_ALIVE}`, marker),
    async probe() {
      try {
        await readFile(marker, "utf8");
        return { state: "ready" };
      } catch {
        return { state: "down", detail: `${marker} is absent` };
      }
    },
  };
}

test("up starts one Endpoint's program and down stops it", async () => {
  const marker = join(await mkdtemp(join(tmpdir(), "hypit-marker-")), "ready");
  const { root, path, options } = await project(() => fileBackedProgram(marker));
  const progress: string[] = [];

  const started = await bringManagedProgramsUp(path, {
    ...options,
    maxWaitMs: 20_000,
    onProgress: (event) => progress.push(`${event.id}:${event.phase}`),
  });
  assert.equal(started.programs.length, 1);
  assert.equal(started.programs[0]!.endpoint, "one");
  assert.equal(started.programs[0]!.action, "started");
  assert.deepEqual(started.programs[0]!.state, { state: "ready" });
  assert.deepEqual(progress, ["example:checking", "example:starting", "example:waiting", "example:ready"]);

  const pid = started.programs[0]!.pid!;
  assert.equal(await readFile(join(root, "programs", "example", "process.pid"), "utf8"), `${pid}\n`);

  // Asking again changes nothing: a healthy program is left alone.
  const again = await bringManagedProgramsUp(path, { ...options, maxWaitMs: 20_000 });
  assert.equal(again.programs[0]!.action, "already-running");
  assert.equal(again.programs[0]!.pid, undefined, "nothing was started, so no pid is claimed");

  const status = await reportManagedPrograms(path, options);
  assert.equal(status.programs[0]!.pid, pid);
  assert.equal(status.programs[0]!.logPath, join(root, "programs", "example", "program.log"));

  await rm(marker, { force: true });
  const stopped = await takeManagedProgramsDown(path, options);
  assert.equal(stopped.programs[0]!.action, "stopped");
  assert.equal(stopped.programs[0]!.pid, pid);
  await sleep(100);
  assert.throws(() => process.kill(pid, 0), "the detached program is gone");
  await assert.rejects(async () => await readFile(join(root, "programs", "example", "process.pid"), "utf8"));
  await rm(root, { recursive: true, force: true });
});

test("a program answering with another identity is never started beside it", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: nodeProgram("process.exit(1);"),
    probe: async () => ({ state: "mismatch", detail: "model is large-v3, expected small" }),
  }));
  const result = await bringManagedProgramsUp(path, options);
  assert.equal(result.programs[0]!.action, "unchanged");
  assert.equal(result.programs[0]!.state.state, "mismatch");
  assert.equal(result.programs[0]!.pid, undefined, "nothing was started beside it");
});

test("down leaves a running program without a Hypit process record", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: nodeProgram("setTimeout(() => {}, 60_000);"),
    probe: async () => ({ state: "ready" }),
  }));
  const result = await takeManagedProgramsDown(path, options);
  assert.equal(result.programs[0]!.action, "not-ours");
  assert.match(result.programs[0]!.detail ?? "", /without a Hypit process record/u);
});

test("a program with nothing to start is installed once, and installation is the whole job", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-prepare-"));
  const marker = join(directory, "installed");
  const { path, options } = await project(() => {
    const probe = async () => {
      try {
        await readFile(marker, "utf8");
        return { state: "ready" as const };
      } catch {
        return { state: "down" as const, detail: "not installed" };
      }
    };
    return {
      id: "example",
      installation: {
        commands: [nodeProgram('require("node:fs").writeFileSync(process.argv[1], "done");', marker)],
        probe,
      },
      probe,
    };
  });
  const result = await bringManagedProgramsUp(path, options);
  assert.equal(result.programs[0]!.action, "installed");
  assert.deepEqual(result.programs[0]!.state, { state: "ready" });
  assert.equal(result.programs[0]!.pid, undefined, "there is no daemon to hold a pid");
  await rm(directory, { recursive: true, force: true });
});

test("up creates a fresh Runtime data directory before running commands", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "hypit-fresh-runtime-"));
  const dataRoot = join(projectRoot, "never-created");
  const path = join(projectRoot, "hypit.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "hypit.runtime-local@1",
    dataRoot: "./never-created",
    credentials: {},
    endpoints: { one: { use: "example.program", config: {} } },
  }));
  const registry = new RuntimeAdapterRegistry();
  const probe = async () => {
    try {
      await readFile(join(dataRoot, "installed"), "utf8");
      return { state: "ready" as const };
    } catch {
      return { state: "down" as const, detail: "not installed" };
    }
  };
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.program",
    activate: () => ({
      endpoint: {
        name: "one",
        manifest: { facets: [] },
        instance: { id: "one" },
        offers: [{
          capability: requiredCapability,
          returns: { module: { name: "example.values", version: "1" }, name: "Value" },
          endpoint: "one",
        }],
        credentials: [],
        install() {},
      } as never,
      program: {
        id: "example",
        installation: {
          commands: [nodeProgram('require("node:fs").writeFileSync("installed", "ready");')],
          probe,
        },
        probe,
      },
    }),
  }));

  const result = await bringManagedProgramsUp(path, { registry });
  assert.equal(result.programs[0]!.action, "installed");
  assert.equal(await readFile(join(dataRoot, "installed"), "utf8"), "ready");
  await rm(projectRoot, { recursive: true, force: true });
});

test("a failing install stops before starting anything, and says which command failed", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    installation: {
      commands: [nodeProgram('process.stderr.write("no such project\\n"); process.exit(1);')],
      probe: async () => ({ state: "down", detail: "not installed" }),
    },
    start: nodeProgram(STAY_ALIVE),
    probe: async () => ({ state: "down", detail: "nothing is answering" }),
  }));
  const result = await bringManagedProgramsUp(path, options);
  assert.equal(result.programs[0]!.action, "unchanged");
  // Naming the command is half of what this test is for, so assert both halves rather than a
  // spelling of the interpreter that only holds on one platform.
  const detail = result.programs[0]!.detail ?? "";
  assert.ok(detail.startsWith(`${process.execPath} failed:`), detail);
  assert.match(detail, /failed: no such project/u);
  assert.equal(result.programs[0]!.logPath, undefined, "nothing was started, so nothing logged");
});

test("up stops waiting when a started program exits", async () => {
  const { root, path, options } = await project(() => ({
    id: "example",
    start: nodeProgram("process.exit(1);"),
    probe: async () => ({ state: "down", detail: "nothing is answering" }),
  }));
  const startedAt = Date.now();
  const result = await bringManagedProgramsUp(path, { ...options, maxWaitMs: 20_000 });
  assert.ok(Date.now() - startedAt < 5_000, "a dead program must not consume the readiness timeout");
  assert.equal(result.programs[0]!.action, "unchanged");
  assert.match(result.programs[0]!.detail ?? "", /process exited; see/u);
  await assert.rejects(async () => await readFile(join(root, "programs", "example", "process.pid"), "utf8"));
});

test("status probes and changes nothing, so it claims no action", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: nodeProgram("process.exit(1);"),
    probe: async () => ({ state: "down", detail: "nothing is answering" }),
  }));
  const result = await reportManagedPrograms(path, options);
  assert.equal(result.programs[0]!.action, undefined);
  assert.deepEqual(result.programs[0]!.state, { state: "down", detail: "nothing is answering" });
});
