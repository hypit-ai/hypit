import assert from "node:assert/strict";
import test from "node:test";

import { decodeBuildResultManifest } from "@hypit/result";

test("Result decoding rejects contradictory terminal and Operation states", () => {
  const build = "bld_20260902T100000000Z_0000000001";
  const base = {
    format: "hypit.build-result@1",
    source: { id: "/project/main.svml" },
    targets: [],
    outputs: {},
  };
  assert.throws(() => decodeBuildResultManifest({
    ...base, outcome: "complete", finishedAt: 1, failure: "impossible",
  }, build), /complete Result cannot have a failure/u);
  assert.throws(() => decodeBuildResultManifest({
    ...base, outcome: "failed", finishedAt: 1,
  }, build), /failed Result has no failure reason/u);
  assert.throws(() => decodeBuildResultManifest({
    ...base,
    outcome: "failed",
    finishedAt: 1,
    failure: "build failed",
    operations: [{ operation: "op", command: "cmd", endpoint: "remote", status: "failed" }],
  }, build), /failed Operation has no failure/u);
  assert.throws(() => decodeBuildResultManifest({
    ...base,
    outcome: "failed",
    finishedAt: 1,
    failure: "build failed",
    operations: [{
      operation: "op", command: "cmd", endpoint: "remote", status: "pending",
      failure: { code: "IMPOSSIBLE", message: "stale" },
    }],
  }, build), /pending Operation cannot have a failure/u);
  assert.equal(decodeBuildResultManifest({
    ...base,
    outcome: "failed",
    finishedAt: 1,
    failure: "other branch failed",
    operations: [{ operation: "op", command: "cmd", endpoint: "remote", status: "received" }],
  }, build).operations?.[0]?.status, "received");
});
