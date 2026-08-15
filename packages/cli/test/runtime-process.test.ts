import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureRuntimeProcess,
  runtimeProcessLogs,
  runtimeProcessStatus,
  stopRuntimeProcess,
} from "../src/runtime-process.js";

test("one detached Runtime Worker is observable, reusable and explicitly stoppable", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-process-"));
  const profile = join(root, "runtime.json");
  const authorLock = join(root, "author.lock");
  const runtimeLock = join(root, "runtime.lock");
  await writeFile(authorLock, "author-v1\n", "utf8");
  await writeFile(runtimeLock, "runtime-v1\n", "utf8");
  await writeFile(profile, JSON.stringify({
    packageLock: "./author.lock",
    runtimePackageLock: "./runtime.lock",
  }), "utf8");
  await mkdir(join(root, ".svml"), { recursive: true });
  await writeFile(join(root, ".svml", "runtime"), "runtime.json\n", "utf8");
  const program = `
    const fs = require("node:fs");
    const path = require("node:path");
    const index = process.argv.indexOf("--ready-file");
    const ready = process.argv[index + 1];
    fs.mkdirSync(path.dirname(ready), { recursive: true });
    fs.writeFileSync(ready, String(process.pid));
    process.stdout.write("worker-ready\\n");
    process.on("SIGTERM", () => process.exit(0));
    setInterval(() => {}, 1000);
  `;
  try {
    const first = await ensureRuntimeProcess(
      profile, { command: process.execPath, args: ["-e", program] }, "revision-1", 5_000);
    assert.equal(first.state, "running");
    assert.ok(first.pid);
    assert.equal(await readFile(join(root, ".svml", "runtime"), "utf8"), "runtime.json\n",
      "Worker state must not overwrite or descend through the active Runtime Profile pointer");
    const second = await ensureRuntimeProcess(profile, { command: "must-not-run", args: [] }, "revision-1", 5_000);
    assert.equal(second.pid, first.pid);
    const concurrent = await Promise.all(Array.from({ length: 8 }, async () =>
      await ensureRuntimeProcess(profile, { command: "must-not-run", args: [] }, "revision-1", 5_000)));
    assert.deepEqual([...new Set(concurrent.map((item) => item.pid))], [first.pid],
      "concurrent clients share one atomically launched Worker");
    assert.equal((await runtimeProcessStatus(profile, "revision-1")).state, "running");
    assert.match((await runtimeProcessLogs(profile)).text, /worker-ready/u);
    const logPath = (await runtimeProcessLogs(profile)).path;
    await appendFile(logPath, `${"x".repeat(1024 * 1024 + 64)}\ntail-marker\n`, "utf8");
    const bounded = await runtimeProcessLogs(profile);
    assert.ok(Buffer.byteLength(bounded.text) <= 1024 * 1024);
    assert.match(bounded.text, /tail-marker/u);
    await writeFile(runtimeLock, "runtime-v2\n", "utf8");
    assert.equal((await runtimeProcessStatus(profile, "revision-2")).state, "stale");
    const replaced = await ensureRuntimeProcess(
      profile, { command: process.execPath, args: ["-e", program] }, "revision-2", 5_000);
    assert.notEqual(replaced.pid, first.pid);
    assert.equal(replaced.state, "running");
    await writeFile(profile, JSON.stringify({
      root: ".",
      packageLock: "./author.lock",
      runtimePackageLock: "./runtime.lock",
    }), "utf8");
    assert.equal((await runtimeProcessStatus(profile, "revision-3")).state, "stale");
    const replacedAgain = await ensureRuntimeProcess(
      profile, { command: process.execPath, args: ["-e", program] }, "revision-3", 5_000);
    assert.notEqual(replacedAgain.pid, replaced.pid);
    assert.equal(replacedAgain.state, "running");
    assert.equal((await stopRuntimeProcess(profile, 5_000)).state, "stopped");
    assert.equal((await runtimeProcessStatus(profile, "revision-3")).state, "stopped");
  } finally {
    await stopRuntimeProcess(profile, 1_000).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
