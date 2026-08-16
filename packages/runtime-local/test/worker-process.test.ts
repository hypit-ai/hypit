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
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-process-"));
  const profile = join(root, "runtime.json");
  const dataRoot = join(root, ".narratage", "runtimes", "local");
  await writeFile(profile, JSON.stringify({ format: "narratage.runtime-profile@1" }), "utf8");
  await mkdir(join(root, ".narratage"), { recursive: true });
  await writeFile(join(root, ".narratage", "runtime"), "runtime.json\n", "utf8");
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
      profile,
      dataRoot,
      { command: process.execPath, args: ["-e", program] },
      5_000,
    );
    assert.equal(first.state, "running");
    assert.ok(first.pid);
    assert.equal(await readFile(join(root, ".narratage", "runtime"), "utf8"), "runtime.json\n");

    const second = await ensureRuntimeProcess(
      profile,
      dataRoot,
      { command: "must-not-run", args: [] },
      5_000,
    );
    assert.equal(second.pid, first.pid);
    assert.equal((await runtimeProcessStatus(profile, dataRoot)).state, "running");
    assert.match((await runtimeProcessLogs(dataRoot)).text, /worker-ready/u);

    assert.equal((await stopRuntimeProcess(profile, dataRoot, 5_000)).state, "stopped");
    assert.equal((await runtimeProcessStatus(profile, dataRoot)).state, "stopped");
  } finally {
    await stopRuntimeProcess(profile, dataRoot, 1_000).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
