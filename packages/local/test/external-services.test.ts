import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { createRuntimeEndpointAdapterFacet } from "@narratage/runtime-adapter";
import type { RuntimeExternalService } from "@narratage/runtime-adapter";
import type { CapabilityRef } from "@narratage/protocol";

import {
  bringExternalServicesUp,
  declaredExternalServices,
  reportExternalServices,
  RuntimeAdapterRegistry,
  takeExternalServicesDown,
} from "@narratage/local";

const requiredCapability = {
  module: { name: "example.capabilities", version: "1" },
  name: "Required",
} as const satisfies CapabilityRef;

/**
 * A stand-in program: `start` writes a file and sleeps, and the probe reads that
 * file back. That is enough to exercise detaching, the pid file, waiting for
 * ready, and stopping — without a Python environment.
 */
async function project(service: (root: string) => RuntimeExternalService) {
  const root = await mkdtemp(join(tmpdir(), "svml-services-"));
  const path = join(root, "svml.runtime.json");
  await writeFile(path, JSON.stringify({
    format: "svml.runtime-config@1",
    runtimeServices: [],
    services: {
      scheduler: "execution.scheduler",
      worker: "execution.worker",
      stores: {
        build: "state.builds",
        operations: "state.operations",
        dispatch: "state.dispatch",
        journal: "state.journal",
        artifacts: "artifacts",
        credentials: ["credentials"],
      },
    },
    endpoints: [
      { use: "example.program", instance: "one", authority: "example.local", config: {} },
      // A second Endpoint driving the same program: it is brought up once.
      { use: "example.program", instance: "two", authority: "example.local", config: {} },
    ],
    permissions: [],
    scheduling: { maxConcurrency: 1 },
  }));
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.program",
    activate: (context) => ({
      endpoint: {
        name: context.instance,
        manifest: { facets: [] },
        instance: { id: context.instance },
        bindings: [{
          capability: requiredCapability,
          returns: { module: { name: "example.values", version: "1" }, name: "Value" },
          endpoint: context.instance,
        }],
        credentials: [],
        install() {},
      } as never,
      externalService: service(root),
    }),
  }));
  return { root, path, options: { registry } };
}

test("a Build service selection ignores programs outside its demanded capabilities", async () => {
  let probes = 0;
  const configured = await project(() => ({
    id: "unused",
    async probe() {
      probes += 1;
      return { state: "ready" as const };
    },
  }));
  const result = await bringExternalServicesUp(configured.path, {
    ...configured.options,
    capabilities: [{
      module: { name: "another.capabilities", version: "1" },
      name: "Other",
    }],
  });
  assert.deepEqual(result.services, []);
  assert.equal(probes, 0);
});

test("an empty Build capability set loads no Runtime Adapter closure", async () => {
  const configured = await project(() => ({
    id: "must-not-load",
    async probe() {
      throw new Error("an empty capability set must not activate or probe an Endpoint");
    },
  }));
  const result = await declaredExternalServices(configured.path, {
    // Deliberately omit the registry. Reaching adapter activation would fail
    // because `example.program` is not installed in a package lock.
    capabilities: [],
  });
  assert.deepEqual(result, { root: configured.root, services: [] });
});

function fileBackedService(root: string, marker: string): RuntimeExternalService {
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
  const marker = join(await mkdtemp(join(tmpdir(), "svml-marker-")), "ready");
  const { root, path, options } = await project((projectRoot) => fileBackedService(projectRoot, marker));
  const progress: string[] = [];

  const started = await bringExternalServicesUp(path, {
    ...options,
    maxWaitMs: 20_000,
    onProgress: (event) => progress.push(`${event.id}:${event.phase}`),
  });
  assert.equal(started.services.length, 1, "one program, not one per Endpoint");
  assert.deepEqual(started.services[0]!.instances, ["one", "two"]);
  assert.equal(started.services[0]!.action, "started");
  assert.deepEqual(started.services[0]!.state, { state: "ready" });
  assert.deepEqual(progress, ["example:checking", "example:starting", "example:waiting", "example:ready"]);

  const pid = started.services[0]!.pid!;
  assert.equal(await readFile(join(root, ".svml", "services", "example.pid"), "utf8"), `${pid}\n`);

  // Asking again changes nothing: a healthy program is left alone.
  const again = await bringExternalServicesUp(path, { ...options, maxWaitMs: 20_000 });
  assert.equal(again.services[0]!.action, "already-running");
  assert.equal(again.services[0]!.pid, undefined, "nothing was started, so no pid is claimed");

  await rm(marker, { force: true });
  const stopped = await takeExternalServicesDown(path, options);
  assert.equal(stopped.services[0]!.action, "stopped");
  assert.equal(stopped.services[0]!.pid, pid);
  await sleep(100);
  assert.throws(() => process.kill(pid, 0), "the detached program is gone");
  await assert.rejects(async () => await readFile(join(root, ".svml", "services", "example.pid"), "utf8"));
  await rm(root, { recursive: true, force: true });
});

test("concurrent up calls atomically share one external service process", async () => {
  const markerRoot = await mkdtemp(join(tmpdir(), "svml-marker-concurrent-"));
  const marker = join(markerRoot, "ready");
  const { root, path, options } = await project((projectRoot) => fileBackedService(projectRoot, marker));
  try {
    const results = await Promise.all(Array.from({ length: 6 }, async () =>
      await bringExternalServicesUp(path, { ...options, maxWaitMs: 20_000 })));
    assert.equal(results.filter((item) => item.services[0]!.action === "started").length, 1);
    assert.equal(results.filter((item) => item.services[0]!.action === "already-running").length, 5);
    const pid = Number.parseInt(await readFile(join(root, ".svml", "services", "example.pid"), "utf8"), 10);
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    await takeExternalServicesDown(path, options);
    await sleep(100);
    assert.throws(() => process.kill(pid, 0));
  } finally {
    await takeExternalServicesDown(path, options).catch(() => undefined);
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
  const result = await bringExternalServicesUp(path, options);
  assert.equal(result.services[0]!.action, "unchanged");
  assert.equal(result.services[0]!.state.state, "mismatch");
  assert.equal(result.services[0]!.pid, undefined, "nothing was started beside it");
});

test("down leaves a running program this project did not start", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: { command: "sh", args: ["-c", "sleep 60"] },
    probe: async () => ({ state: "ready" }),
  }));
  const result = await takeExternalServicesDown(path, options);
  assert.equal(result.services[0]!.action, "not-ours");
  assert.match(result.services[0]!.detail ?? "", /this project did not start it/u);
});

test("a program with nothing to start is prepared, and preparing is the whole job", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-prepare-"));
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
  const result = await bringExternalServicesUp(path, options);
  assert.equal(result.services[0]!.action, "prepared");
  assert.deepEqual(result.services[0]!.state, { state: "ready" });
  assert.equal(result.services[0]!.pid, undefined, "there is no daemon to hold a pid");
  await rm(directory, { recursive: true, force: true });
});

test("a failing prepare stops before starting anything, and says which command failed", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    prepare: { command: "sh", args: ["-c", "echo 'no such project' >&2; exit 1"] },
    start: { command: "sh", args: ["-c", "while true; do sleep 1; done"] },
    probe: async () => ({ state: "down", detail: "nothing is answering" }),
  }));
  const result = await bringExternalServicesUp(path, options);
  assert.equal(result.services[0]!.action, "unchanged");
  assert.match(result.services[0]!.detail ?? "", /sh failed: no such project/u);
  assert.equal(result.services[0]!.logPath, undefined, "nothing was started, so nothing logged");
});

test("status probes and changes nothing, so it claims no action", async () => {
  const { path, options } = await project(() => ({
    id: "example",
    start: { command: "sh", args: ["-c", "exit 1"] },
    probe: async () => ({ state: "down", detail: "nothing is answering" }),
  }));
  const result = await reportExternalServices(path, options);
  assert.equal(result.services[0]!.action, undefined);
  assert.deepEqual(result.services[0]!.state, { state: "down", detail: "nothing is answering" });
});
