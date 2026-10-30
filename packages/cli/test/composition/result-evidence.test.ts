import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { commandHint } from "../../src/command-hint.js";
import test from "node:test";

import {
  FileBuildResult,
  FileBuildResultStore,
} from "@hypit/result/runtime-storage/node";
import type { CapabilityRef, TypedRecord } from "@hypit/protocol";

import type { CliDistribution } from "../../src/distribution.js";
import { cliDistribution } from "../distribution-scenario.js";
import { runCli } from "../../src/main.js";
import {
  completedRecords,
  fixture,
  generationCapability,
  humanCommand,
  jsonCommand,
  resultIntent,
  resultDistribution,
  valueType,
} from "./build-result-scenario.js";

test("a failed Result exposes task receipts without a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-receipts-"));
  const id = "bld_20260906T110000000Z_0000000001";
  try {
    const result = await FileBuildResult.create(join(root, ".hypit", "results"), {
      id, sourcePath: "main.svml", targets: [], intent: resultIntent([]),
    });
    const operation = {
      endpoint: "selected-account", capability: generationCapability,
      receipt: { id: "remote-task-1" }, outcome: "failed" as const,
      failure: { code: "DOWNLOAD_FAILED", message: `HTTP 502; request=req-example; ${"public reason ".repeat(35)}last diagnostic detail` },
      failedAt: 2,
    };
    await result.finish({ outcome: "failed", failure: "download failed", operations: [operation] });
    const inspected = await jsonCommand(["inspect", id], root) as {
      build: { outcome: string; operations: unknown[] };
    };
    assert.equal(inspected.build.outcome, "failed");
    assert.deepEqual(inspected.build.operations, [{
      endpoint: operation.endpoint, outcome: operation.outcome, receipt: operation.receipt, failure: operation.failure,
    }]);
    const detailed = await jsonCommand(["inspect", id, "--verbose"], root) as { build: { operations: unknown[] } };
    assert.deepEqual(detailed.build.operations, [operation]);
    const human = await humanCommand(["inspect", id], root);
    assert.match(human, /remote-task-1/);
    assert.match(human, /DOWNLOAD_FAILED/);
    assert.ok(human.includes(operation.failure.message));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("logs reads finished evidence without a Runtime and clearly limits the tail", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-logs-"));
  try {
    const id = "bld_20260913T130000000Z_0000000001";
    const result = await FileBuildResult.create(join(root, ".hypit/results"), {
      id, sourcePath: "main.svml", targets: [], intent: resultIntent([]),
    });
    const records = ["started", "completed"].map((kind, time) => ({ format: "hypit.execution-log@1", time, kind, endpoint: "renderer", command: "c1" }));
    await result.finish({ outcome: "complete", executionLog: (async function* () {
      yield Buffer.from(records.map((record) => JSON.stringify(record) + "\n").join(""));
    })() });
    await writeFile(join(root, ".hypit/runtime"), "missing-profile.json\n");
    assert.ok((await humanCommand(["inspect", id], root)).includes(
      commandHint(["logs", id], { projectRoot: await realpath(root) }),
    ));
    assert.deepEqual(await jsonCommand(["logs", id, "--lines", "1"], root), {
      format: "hypit.cli-logs@1", build: id, source: "result", records: [records[1]], omittedRecords: 1,
    });
    assert.match(await humanCommand(["logs", id, "--lines", "1"], root), /earlier records omitted/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("logs reports unavailable evidence as unsuccessful, while an existing empty log is valid", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-missing-log-"));
  try {
    const id = "bld_20260902T110000000Z_0000000001";
    for (const state of ["missing", "no-log", "empty-log"] as const) {
      if (state === "no-log") await fixture(root);
      if (state === "empty-log") {
        const result = await FileBuildResult.create(join(root, ".hypit/results"), {
          id: "bld_20260902T110000001Z_0000000001", sourcePath: "main.svml", targets: [], intent: resultIntent([]),
        });
        await result.finish({ outcome: "complete", executionLog: (async function* () {})() });
      }
      let exit = 0;
      let output = "";
      await runCli(["logs", state === "empty-log" ? "bld_20260902T110000001Z_0000000001" : id, "--project", root, "--json"], {
        write: (text) => { output += text; }, setExitCode: (code) => { exit = code; },
      }, resultDistribution());
      assert.equal(exit, state === "empty-log" ? 0 : 1);
      assert.equal(JSON.parse(output).source, state === "empty-log" ? "result" : "unavailable");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
