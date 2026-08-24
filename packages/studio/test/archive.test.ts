import assert from "node:assert/strict";
import test from "node:test";

import type { BuildState, Digest } from "@hypit/protocol";
import type { BuildCatalogEntry } from "@hypit/runtime";
import type { RuntimeHostStatus } from "@hypit/runtime-host-node";

import { readStudioLibrary } from "../src/archive.js";

const digest = `sha256:${"a".repeat(64)}` as Digest;

function state(): BuildState {
  return {
    format: "hypit.build@1",
    program: { closure: { format: "hypit.closure@1", modules: [] }, records: [] },
    graph: { format: "hypit.graph@1", outputs: [], candidates: [], operations: [] },
    request: { format: "hypit.build-request@1", targets: [{ output: "final-output" }] },
    plan: {
      format: "hypit.plan@1",
      steps: [],
      goals: [{ record: "final-record", type: { module: { name: "example", version: "1" }, name: "Video" } }],
      selections: [{ output: "final-output", candidate: "render", record: "final-record" }],
    },
    status: "complete",
    records: [{
      id: "final-record",
      type: { module: { name: "example", version: "1" }, name: "Video" },
      value: { kind: "blob", digest, size: 42, mediaType: "video/mp4" },
    }],
    steps: [],
    needs: [],
    outstanding: [],
    diagnostics: [],
  };
}

function catalog(build: string, root: string): BuildCatalogEntry {
  return {
    build,
    createdAt: 100,
    source: { path: `${root}/author/main.svml` },
    run: { path: `${root}/runs/build.svrun` },
    aliases: [{ name: "final.video", ref: { kind: "logical-output", id: "final-output" } }],
  };
}

test("Studio library shows only this environment's archived Builds and accepted Artifacts", async () => {
  const relevant = catalog("build-inside", "/project");
  const unrelated = catalog("build-outside", "/another-project");
  const status: RuntimeHostStatus = {
    build: { build: relevant.build, definition: {} as never, facts: [], state: state() },
    catalog: relevant,
    operations: [],
    dispatch: {
      build: relevant.build,
      componentPackages: [],
      createdAt: 100,
      availableAt: 100,
      phase: "terminal",
      terminal: "complete",
    },
  };
  const view = await readStudioLibrary({
    profile: "/project/hypit.runtime.json",
    workspaceRoot: "/project",
    runtime: {
      async builds() { return [relevant, unrelated]; },
      async status(build) {
        assert.equal(build, relevant.build);
        return status;
      },
    },
  });

  assert.deepEqual(view.tasks.map((task) => ({
    id: task.id,
    status: task.status,
    source: task.source,
    run: task.run,
    targets: task.targets,
  })), [{
    id: "build-inside",
    status: "complete",
    source: "author/main.svml",
    run: "runs/build.svrun",
    targets: ["final.video"],
  }]);
  assert.deepEqual(view.artifacts.map((artifact) => ({
    build: artifact.build,
    digest: artifact.digest,
    mediaType: artifact.mediaType,
    outputs: artifact.outputs,
  })), [{
    build: "build-inside",
    digest,
    mediaType: "video/mp4",
    outputs: ["final.video"],
  }]);
});
