import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureRuntimeProcess,
  runtimeProcessLogs,
  runtimeProcessStatus,
  stopRuntimeProcess,
} from "../src/worker-process.js";

test("one live detached Runtime Worker survives repeated starts and stale startup markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-process-"));
  const profile = join(root, "runtime.json");
  const dataRoot = join(root, ".hypit", "runtimes", "local");
  await writeFile(profile, JSON.stringify({ format: "hypit.runtime-local@1" }), "utf8");
  await mkdir(join(root, ".hypit"), { recursive: true });
  await writeFile(join(root, ".hypit", "runtime"), "runtime.json\n", "utf8");
  const program = `
    const fs = require("node:fs");
    const path = require("node:path");
    const index = process.argv.indexOf("--ready-file");
    const ready = process.argv[index + 1];
    const ownerIndex = process.argv.indexOf("--worker-owner");
    const owner = process.argv[ownerIndex + 1];
    fs.mkdirSync(path.dirname(ready), { recursive: true });
    // Say it in the log before claiming to be ready. The ready file is what the parent waits on,
    // so anything written after it is a race the parent can win.
    process.stdout.write("worker-ready\\n");
    fs.writeFileSync(ready, owner);
    const keepAlive = setInterval(() => undefined, 1000);
    process.on("SIGTERM", () => {
      clearInterval(keepAlive);
      process.exit(0);
    });
  `;
  try {
    const [first, concurrent] = await Promise.all([
      ensureRuntimeProcess(
        profile,
        dataRoot,
        { command: process.execPath, args: ["-e", program] },
        5_000,
      ),
      ensureRuntimeProcess(
        profile,
        dataRoot,
        { command: process.execPath, args: ["-e", program] },
        5_000,
      ),
    ]);
    assert.equal(first.state, "running");
    assert.ok(first.pid);
    assert.equal(concurrent.pid, first.pid);
    assert.equal(await readFile(join(root, ".hypit", "runtime"), "utf8"), "runtime.json\n");

    const second = await ensureRuntimeProcess(
      profile,
      dataRoot,
      { command: "must-not-run", args: [] },
      5_000,
    );
    assert.equal(second.pid, first.pid);
    assert.equal((await runtimeProcessStatus(profile, dataRoot)).state, "running");
    assert.match((await runtimeProcessLogs(dataRoot)).text, /worker-ready/u);

    await rm(join(dataRoot, "worker", "ready"));
    const afterMissingStartupMarker = await ensureRuntimeProcess(
      profile,
      dataRoot,
      { command: "must-not-run", args: [] },
      5_000,
    );
    assert.equal(afterMissingStartupMarker.pid, first.pid);

    await writeFile(profile, JSON.stringify({ format: "hypit.runtime-local@1", changed: true }), "utf8");
    assert.equal((await runtimeProcessStatus(profile, dataRoot)).configuration, "changed");
    await assert.rejects(
      ensureRuntimeProcess(profile, dataRoot, { command: "must-not-run", args: [] }, 5_000),
      /Runtime Profile changed/u,
    );

    assert.equal((await stopRuntimeProcess(profile, dataRoot, 5_000)).state, "stopped");
    assert.equal((await runtimeProcessStatus(profile, dataRoot)).state, "stopped");
  } finally {
    await stopRuntimeProcess(profile, dataRoot, 1_000).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime logs include separately redirected errors even without standard output", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-logs-"));
  const worker = join(root, "worker");
  try {
    await mkdir(worker);
    await writeFile(join(worker, "worker.err.log"), "worker could not load the Profile\n");
    assert.equal((await runtimeProcessLogs(root)).text, "[stderr]\nworker could not load the Profile\n");
    await writeFile(join(worker, "worker.log"), "worker starting\n");
    assert.equal((await runtimeProcessLogs(root)).text,
      "worker starting\n[stderr]\nworker could not load the Profile\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a Worker that fails before readiness reports its error stream", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-start-error-"));
  const profile = join(root, "runtime.json");
  const dataRoot = join(root, "runtime");
  await writeFile(profile, JSON.stringify({ format: "hypit.runtime-local@1" }));
  try {
    await assert.rejects(ensureRuntimeProcess(profile, dataRoot, {
      command: process.execPath,
      args: ["-e", 'process.stderr.write("worker configuration could not load\\n"); process.exitCode = 1;'],
    }, 5_000), /worker configuration could not load/u);
  } finally {
    await stopRuntimeProcess(profile, dataRoot, 1_000).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
