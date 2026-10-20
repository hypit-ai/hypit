import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileExecutionLogs } from "../../src/log.js";

test("parallel appends form complete records, another reader sees their bounded tail", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-log-"));
  try {
    const logs = fileExecutionLogs((build) => join(root, build));
    await Promise.all(Array.from({ length: 40 }, (_, index) => logs.record("build", `c${index}`, {
      endpoint: "renderer", kind: "diagnostic", level: "info", message: `中文 ${index}\nsecond line`,
    })));
    const reader = fileExecutionLogs((build) => join(root, build));
    const view = (await reader.read("build", 3))!;
    assert.equal(view.total, 40);
    assert.deepEqual(view.records.map((item) => item.command), ["c37", "c38", "c39"]);
    await appendFile(join(root, "build/execution.jsonl"), '{"unfinished":');
    assert.deepEqual(await reader.read("build", 3), view);
    assert.equal(await reader.read("missing", 3), undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a logging failure is surfaced to Result writing without throwing into the external call", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-log-failure-"));
  try {
    await writeFile(join(root, "occupied"), "not a directory");
    const logs = fileExecutionLogs(() => join(root, "occupied"));
    await logs.record("build", "c1", { endpoint: "renderer", kind: "started" });
    await assert.rejects(logs.open("build"), /execution log could not be saved/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
