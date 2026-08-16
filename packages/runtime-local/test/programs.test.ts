import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { createRuntimeEndpointAdapterFacet } from "@narratage/runtime-kit";
import type { ManagedProgram } from "@narratage/runtime-kit";
import type { CapabilityRef } from "@narratage/protocol";

import {
  bringManagedProgramsUp,
  declaredManagedPrograms,
  reportManagedPrograms,
  RuntimeAdapterRegistry,
  takeManagedProgramsDown,
} from "@narratage/runtime-local";

const requiredCapability = {
  module: { name: "example.capabilities", version: "1" },
  name: "Required",
} as const satisfies CapabilityRef;

/**
 * A stand-in program: `start` writes a file and sleeps, and the probe reads that
 * file back. That is enough to exercise detaching, the pid file, waiting for
 * ready, and stopping — without a Python environment.
 */
async function project(program: (root: string) => ManagedProgram) {
  const root = await mkdtemp(join(tmpdir(), "narratage-programs-"));
  const path = join(root, "narratage.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "narratage.runtime-profile@1",
    runtime: {
      use: "@narratage/runtime-local",
      config: {
        dataRoot: ".",
        artifacts: { use: "example.artifacts" },
        credentials: {},
        endpoints: {
          one: { use: "example.program", pool: "example.local", config: {} },
          two: { use: "example.program", pool: "example.local", config: {} },
        },
        concurrency: 1,
      },
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

test("an empty Build capability set loads no Runtime Adapter closure", async () => {
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

function fileBackedProgram(root: string, marker: string): ManagedProgram {
  return {
    id: "example",
    start: { command: "sh", args: ["-c", `printf ready > ${marker}; while true; do sleep 1; done`] },
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

test("up starts the program once for every Endpoint that drives it, and down stops it", async () => {
  const marker = join(await mkdtemp(join(tmpdir(), "narratage-marker-")), "ready");
  const { root, path, options } = await project((projectRoot) => fileBackedProgram(projectRoot, marker));
  const progress: string[] = [];

  const started = await bringManagedProgramsUp(path, {
    ...options,
    maxWaitMs: 20_000,
    onProgress: (event) => progress.push(`${event.id}:${event.phase}`),
  });
  assert.equal(started.programs.length, 1, "one program, not one per Endpoint");
  assert.deepEqual(started.programs[0]!.instances, ["one", "two"]);
  assert.equal(started.programs[0]!.action, "started");
  assert.deepEqual(started.programs[0]!.state, { state: "ready" });
  assert.deepEqual(progress, ["example:checking", "example:starting", "example:waiting", "example:ready"]);

  const pid = started.programs[0]!.pid!;
  assert.equal(await readFile(join(root, "programs", "example.pid"), "utf8"), `${pid}\n`);

  // Asking again changes nothing: a healthy program is left alone.
  const again = await bringManagedProgramsUp(path, { ...options, maxWaitMs: 20_000 });
  assert.equal(again.programs[0]!.action, "already-running");
  assert.equal(again.programs[0]!.pid, undefined, "nothing was started, so no pid is claimed");

  const status = await reportManagedPrograms(path, options);
  assert.equal(status.programs[0]!.pid, pid);
  assert.equal(status.programs[0]!.logPath, join(root, "programs", "example.log"));

  await rm(marker, { force: true });
  const stopped = await takeManagedProgramsDown(path, options);
  assert.equal(stopped.programs[0]!.action, "stopped");
  assert.equal(stopped.programs[0]!.pid, pid);
  await sleep(100);
  assert.throws(() => process.kill(pid, 0), "the detached program is gone");
  await assert.rejects(async () => await readFile(join(root, "programs", "example.pid"), "utf8"));
  await rm(root, { recursive: true, force: true });
});

test("concurrent up calls atomically share one Managed Program process", async () => {
  const markerRoot = await mkdtemp(join(tmpdir(), "narratage-marker-concurrent-"));
  const marker = join(markerRoot, "ready");
  const { root, path, options } = await project((projectRoot) => fileBackedProgram(projectRoot, marker));
  try {
    const results = await Promise.all(Array.from({ length: 6 }, async () =>
      await bringManagedProgramsUp(path, { ...options, maxWaitMs: 20_000 })));
    assert.equal(results.filter((item) => item.programs[0]!.action === "started").length, 1);
    assert.equal(results.filter((item) => item.programs[0]!.action === "already-running").length, 5);
    const pid = Number.parseInt(await readFile(join(root, "programs", "example.pid"), "utf8"), 10);
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    await takeManagedProgramsDown(path, options);
    await sleep(100);
    assert.throws(() => process.kill(pid, 0));
  } finally {
    await takeManagedProgramsDown(path, options).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    await rm(markerRoot, { recursive: true, force: true });
  }
});

test("a program answering with another identity is never joined by a second copy", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: { command: "sh", args: ["-c", "exit 1"] },
    probe: async () => ({ state: "mismatch", detail: "model is large-v3, expected small" }),
  }));
  const result = await bringManagedProgramsUp(path, options);
  assert.equal(result.programs[0]!.action, "unchanged");
  assert.equal(result.programs[0]!.state.state, "mismatch");
  assert.equal(result.programs[0]!.pid, undefined, "nothing was started beside it");
});

test("down leaves a running program this project did not start", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: { command: "sh", args: ["-c", "sleep 60"] },
    probe: async () => ({ state: "ready" }),
  }));
  const result = await takeManagedProgramsDown(path, options);
  assert.equal(result.programs[0]!.action, "not-ours");
  assert.match(result.programs[0]!.detail ?? "", /this project did not start it/u);
});

test("a program with nothing to start is prepared, and preparing is the whole job", async () => {
  const directory = await mkdtemp(join(tmpdir(), "narratage-prepare-"));
  const marker = join(directory, "installed");
  const { path, options } = await project(() => ({
    id: "example",
    prepare: { command: "sh", args: ["-c", `printf done > ${marker}`] },
    async probe() {
      try {
        await readFile(marker, "utf8");
        return { state: "ready" };
      } catch {
        return { state: "down", detail: "not installed" };
      }
    },
  }));
  const result = await bringManagedProgramsUp(path, options);
  assert.equal(result.programs[0]!.action, "prepared");
  assert.deepEqual(result.programs[0]!.state, { state: "ready" });
  assert.equal(result.programs[0]!.pid, undefined, "there is no daemon to hold a pid");
  await rm(directory, { recursive: true, force: true });
});

test("a failing prepare stops before starting anything, and says which command failed", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    prepare: { command: "sh", args: ["-c", "echo 'no such project' >&2; exit 1"] },
    start: { command: "sh", args: ["-c", "while true; do sleep 1; done"] },
    probe: async () => ({ state: "down", detail: "nothing is answering" }),
  }));
  const result = await bringManagedProgramsUp(path, options);
  assert.equal(result.programs[0]!.action, "unchanged");
  assert.match(result.programs[0]!.detail ?? "", /sh failed: no such project/u);
  assert.equal(result.programs[0]!.logPath, undefined, "nothing was started, so nothing logged");
});

test("status probes and changes nothing, so it claims no action", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: { command: "sh", args: ["-c", "exit 1"] },
    probe: async () => ({ state: "down", detail: "nothing is answering" }),
  }));
  const result = await reportManagedPrograms(path, options);
  assert.equal(result.programs[0]!.action, undefined);
  assert.deepEqual(result.programs[0]!.state, { state: "down", detail: "nothing is answering" });
});
