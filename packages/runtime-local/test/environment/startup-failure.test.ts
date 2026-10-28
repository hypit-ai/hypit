import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import test from "node:test";
import { defineBuild } from "@hypit/kernel";
import { FileBuildResultRepository } from "@hypit/result/node";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";
import { createGreetingBuild, types } from "../execution-scenario.js";
import { statePath } from "../../src/config.js";
import { superviseBuilds } from "../../src/supervisor.js";

const distribution = fileURLToPath(new URL("../../../../", import.meta.url));

test("an executor that fails before ready records a failed Build and leaves supervision available", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-executor-startup-"));
  const dataRoot = join(root, "runtime");
  const profile = join(root, "profile.json");
  const result = new FileBuildResultRepository(join(root, "results"));
  const state = new SqliteRuntimeState(statePath(dataRoot));
  const abort = new AbortController();
  let supervision: Promise<void> | undefined;
  try {
    const profileValue = { format: "hypit.runtime-local@1", dataRoot, credentials: {}, endpoints: {}, bindings: {} };
    await writeFile(profile, JSON.stringify(profileValue));
    const initial = createGreetingBuild();
    const submit = async (build: string): Promise<void> => {
      const request = {
        build,
        executionPackages: [],
        result: { root, path: "results" },
        context: { format: "hypit.local-execution@1", packageRoot: root, hostStateRoot: join(root, "host"),
          distributionPackageRoot: distribution, profile: profileValue },
      };
      await state.submissions.prepare(request);
      await result.create({ id: build, sourceId: "main.svml", publication: { outputs: [{
        name: "document", output: "document", target: true, type: types.document, record: "document:root",
      }] } });
      await state.submissions.commit({ ...request,
        definition: defineBuild({ program: initial.program,
          plan: initial.plan }),
        catalog: { sourcePath: join(root, "main.svml"), publication: { outputs: [{
          name: "document", output: "document", target: true, type: types.document, record: "document:root",
        }] } },
      });
    };
    const failed = async (build: string) => {
      const deadline = Date.now() + 10_000;
      let recorded = await result.read(build);
      while (recorded?.outcome === undefined && Date.now() < deadline) {
        await pause(25);
        recorded = await result.read(build);
      }
      assert.equal(recorded?.outcome, "failed");
      assert.match(recorded.failure ?? "", /executor startup failed/u);
    };
    await submit("bld_20260919T120000000Z_0000000001");
    supervision = superviseBuilds({ profile, dataRoot, readyFile: join(root, "ready"), owner: "startup-test",
      launch: { command: process.execPath, args: ["--eval", "process.exit(3)"] },
      signal: abort.signal, ready: async () => {} });
    await failed("bld_20260919T120000000Z_0000000001");
    await submit("bld_20260919T120000001Z_0000000001");
    await failed("bld_20260919T120000001Z_0000000001");
    assert.deepEqual(await state.execution.listUnstarted(), []);
    assert.deepEqual(await state.execution.listCapacity(), []);
  } finally {
    abort.abort();
    await supervision;
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
