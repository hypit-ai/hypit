import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  await writeFile(profile, "{}\n", "utf8");
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
    const first = await ensureRuntimeProcess(profile, { command: process.execPath, args: ["-e", program] }, 5_000);
    assert.equal(first.state, "running");
    assert.ok(first.pid);
    const second = await ensureRuntimeProcess(profile, { command: "must-not-run", args: [] }, 5_000);
    assert.equal(second.pid, first.pid);
    assert.equal((await runtimeProcessStatus(profile)).state, "running");
    assert.match((await runtimeProcessLogs(profile)).text, /worker-ready/u);
    assert.equal((await stopRuntimeProcess(profile, 5_000)).state, "stopped");
    assert.equal((await runtimeProcessStatus(profile)).state, "stopped");
  } finally {
    await stopRuntimeProcess(profile, 1_000).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
