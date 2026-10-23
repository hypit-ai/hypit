import assert from "node:assert/strict";
import test from "node:test";

import type { BuildResultManifest, BuildResultRepository } from "@hypit/result";
import type { TypeRef } from "@hypit/protocol";
import type { CliBuildView as BuildView } from "../../src/runtime-port.js";
import { buildResultView, buildStatusView } from "../../src/view.js";

const valueType: TypeRef = {
  module: { name: "example", version: "1" },
  name: "Value",
};

test("inspection chooses its scope before following any Output reference", async () => {
  const names = ["final", "important", ...Array.from({ length: 50 }, (_, i) => `unused-${i}`)];
  const manifest: BuildResultManifest = {
    format: "hypit.build-result@1",
    id: "bld_20260913T093030369Z_55907CDA9E", sourceId: "main.svml",
    targets: ["final"], highlightedOutputs: ["important"],
    outputs: Object.fromEntries(names.map((name) => [name, {
      type: valueType,
      value: { kind: "inline" as const, value: null },
    }])),
  };
  const reads: string[] = [];
  const repository: Pick<BuildResultRepository, "describeOutput"> = {
    async describeOutput(_build: string, name: string) {
      reads.push(name);
      if (name.startsWith("unused-")) throw new Error("unrelated reference is unavailable");
      return { representation: "inline", type: valueType };
    },
  };
  const view = await buildResultView(repository, manifest, { projectRoot: "/project", limit: 1 });
  assert.deepEqual(reads, ["final", "important"]);
  assert.equal(view.outputCount, 52);
  assert.equal(view.otherOutputCount, 50);
  assert.equal(view.omittedOutputs, undefined);
  reads.length = 0;
  await buildResultView(repository, manifest, { projectRoot: "/project", limit: 1, output: "important" });
  assert.deepEqual(reads, ["important"]);
  reads.length = 0;
  const detailed = await buildResultView(repository, manifest, { projectRoot: "/project", limit: 1, verbose: true });
  assert.deepEqual(reads, ["final"]);
  assert.equal(detailed.omittedOutputs, 51);
});

test("status groups identical active requests and retains late failures without verbose", () => {
  const pending: BuildView["operations"] = Array.from({ length: 30 }, (_, index) => ({
    id: `op-${index}`, endpoint: "chosen", status: "pending" as const, receipt: { id: `remote-${index}` },
    progress: { phase: "generating" },
  }));
  const runtime: BuildView = {
    id: "build", createdAt: 0, targets: ["final"], activity: "running",
 acceptedRecords: 0, outstandingCommands: 1,
    operations: [...pending,
      { id: "done", endpoint: "chosen", status: "completed" as const, receipt: { id: "completed-remote" } },
      { id: "failed", endpoint: "chosen", status: "failed" as const, receipt: { id: "failed-remote" },
        failure: { code: "NETWORK", message: "download failed" } }],
    commands: [{ id: "raw-command-id", endpoint: "renderer", progress: { phase: "capturing", completed: 50, total: 100, unit: "frames" } }],
  };
  const view = buildStatusView({ id: "build", runtime });
  assert.deepEqual(view.targets, ["final"]);
  assert.equal(view.operations?.length, 2);
  assert.equal(view.operations?.[0]?.count, 30);
  assert.equal(view.operations?.[0]?.receipt, undefined);
  assert.equal(view.operations?.[1]?.failure?.message, "download failed");
  assert.equal(view.operations?.[1]?.receipt?.id, "failed-remote");
  assert.equal(view.commands?.[0]?.progress.completed, 50);
  assert.equal(view.commands?.[0]?.id, undefined);
  const detailed = buildStatusView({ id: "build", runtime, verbose: true });
  assert.equal(detailed.operations?.length, 32);
  assert.equal(detailed.operations?.[0]?.receipt?.id, "remote-0");
  assert.equal(detailed.operations?.find(item => item.state === "completed")?.receipt?.id, "completed-remote");
});

test("finished status retains completed receipts only when requested", () => {
  const result: BuildResultManifest = {
    format: "hypit.build-result@1",
    id: "bld_20260913T093030369Z_55907CDA9E",
    sourceId: "main.svml",
    targets: [],
    outcome: "complete",
    finishedAt: 1,
    outputs: {}, operations: [
    { operation: "done", command: "command-1", endpoint: "chosen", status: "completed", receipt: { id: "remote-task" } },
  ] };
  assert.equal(buildStatusView({ id: "build", result }).operations, undefined);
  const detailed = buildStatusView({ id: "build", result, verbose: true });
  assert.equal(detailed.operations?.[0]?.receipt?.id, "remote-task");
  assert.equal(detailed.work.outcome, "complete");
});
