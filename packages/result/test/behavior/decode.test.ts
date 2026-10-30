import assert from "node:assert/strict";
import test from "node:test";

import { decodeBuildResultValueDocument } from "@hypit/result";
import { decodeStoredBuildResult } from "@hypit/result/runtime-storage";

test("Result decoding rejects contradictory terminal and Operation states", () => {
  const build = "bld_20260902T100000000Z_0000000001";
  const base = {
    format: "hypit.build-result@1",
    sourcePath: "/project/main.svml",
    targets: [],
    outputs: {},
  };
  assert.throws(() => decodeStoredBuildResult({
    ...base, outcome: "complete", finishedAt: 1, failure: "impossible",
  }, build), /complete Result cannot have a failure/u);
  assert.throws(() => decodeStoredBuildResult({
    ...base, outcome: "failed", finishedAt: 1,
  }, build), /failed Result has no failure reason/u);
  assert.throws(() => decodeStoredBuildResult({
    ...base,
    outcome: "failed",
    finishedAt: 1,
    failure: "build failed",
    operations: [{ capability: { module: { name: "example", version: "1" }, name: "generate" },
      endpoint: "remote", outcome: "failed", failedAt: 0 }],
  }, build), /failed Operation has no failure/u);
  assert.throws(() => decodeStoredBuildResult({
    ...base,
    outcome: "failed",
    finishedAt: 1,
    failure: "build failed",
    operations: [{
      capability: { module: { name: "example", version: "1" }, name: "generate" },
      endpoint: "remote", acknowledgedAt: 0,
      failure: { code: "IMPOSSIBLE", message: "stale" },
    }],
  }, build), /accepted Operation cannot have a failure/u);
  assert.equal(decodeStoredBuildResult({
    ...base,
    outcome: "failed",
    finishedAt: 1,
    failure: "other branch failed",
    operations: [{ capability: { module: { name: "example", version: "1" }, name: "generate" },
      endpoint: "remote", acknowledgedAt: 0, providerCompletedAt: 1, outcome: "complete" }],
  }, build).operations?.[0]?.outcome, "complete");
});

test("Result decoders reconstruct owned values from untrusted documents", () => {
  const build = "bld_20260902T100000000Z_0000000001";
  const manifest = decodeStoredBuildResult({
    format: "hypit.build-result@1",
    sourcePath: "main.svml",
    targets: [],
    outputs: {},
    outcome: "complete",
    finishedAt: 1,
    executionLog: {
      kind: "build-file", path: "execution.jsonl", size: 12, mediaType: "application/x-ndjson",
      extra: "not owned",
    },
    extra: "not owned",
  }, build);
  assert.deepEqual(manifest, {
    format: "hypit.build-result@1",
    id: build,
    sourcePath: "main.svml",
    targets: [],
    outputs: {},
    outcome: "complete",
    finishedAt: 1,
    executionLog: {
      kind: "build-file", path: "execution.jsonl", size: 12, mediaType: "application/x-ndjson",
    },
  });

  const value = decodeBuildResultValueDocument({
    format: "hypit.result-value@1",
    value: { title: "hello" },
    resources: [],
    extra: "not owned",
  });
  assert.deepEqual(value, { format: "hypit.result-value@1", value: { title: "hello" }, resources: [] });
});
