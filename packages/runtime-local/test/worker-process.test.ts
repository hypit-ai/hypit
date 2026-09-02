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

test("one detached Runtime Worker can be started, observed and stopped", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-process-"));
  const profile = join(root, "runtime.json");
  const dataRoot = join(root, ".hypit", "runtimes", "local");
  await writeFile(profile, JSON.stringify({ format: "hypit.runtime-profile@1" }), "utf8");
  await mkdir(join(root, ".hypit"), { recursive: true });
  await writeFile(join(root, ".hypit", "runtime"), "runtime.json\n", "utf8");
  const program = `
    const fs = require("node:fs");
    const path = require("node:path");
    const { DatabaseSync } = require("node:sqlite");
    const index = process.argv.indexOf("--ready-file");
    const ready = process.argv[index + 1];
    const ownerIndex = process.argv.indexOf("--worker-owner");
    const owner = process.argv[ownerIndex + 1];
    const databasePath = ${JSON.stringify(join(dataRoot, "runtime.sqlite"))};
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE IF NOT EXISTS hypit_worker_lease (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), owner_id TEXT NOT NULL, pid INTEGER NOT NULL, acquired_at INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT");
    const now = Date.now();
    database.prepare("INSERT OR REPLACE INTO hypit_worker_lease (singleton, owner_id, pid, acquired_at, expires_at) VALUES (1, ?, ?, ?, ?)").run(owner, process.pid, now, now + 60000);
    fs.mkdirSync(path.dirname(ready), { recursive: true });
    // Say it in the log before claiming to be ready. The ready file is what the parent waits on,
    // so anything written after it is a race the parent can win.
    process.stdout.write("worker-ready\\n");
    fs.writeFileSync(ready, owner);
    const heartbeat = setInterval(() => database.prepare("UPDATE hypit_worker_lease SET expires_at = ? WHERE singleton = 1 AND owner_id = ? AND pid = ?").run(Date.now() + 60000, owner, process.pid), 1000);
    process.on("SIGTERM", () => {
      clearInterval(heartbeat);
      database.prepare("DELETE FROM hypit_worker_lease WHERE singleton = 1 AND owner_id = ? AND pid = ?").run(owner, process.pid);
      database.close();
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

    await writeFile(profile, JSON.stringify({ format: "hypit.runtime-profile@1", changed: true }), "utf8");
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
