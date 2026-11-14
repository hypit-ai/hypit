import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCliApplication } from "@hypit/cli";
import { createLocalExecutionEnvironmentCliCommandModules } from "@hypit/execution-environment-local/cli";

test("programs addresses an Environment Profile directly", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-environment-cli-"));
  const profile = join(root, "hypit.environment.json");
  await writeFile(profile, JSON.stringify({
    format: "hypit.execution-environment-local@1",
    dataRoot: join(root, "state"),
    credentials: {},
    endpoints: {},
  }));
  const modules = createLocalExecutionEnvironmentCliCommandModules({ packageRoot: root });
  let output = "";
  try {
    await runCliApplication(["programs", "status", "--environment", profile, "--json"], {
      write(text) { output += text; },
    }, {
      commandModules: modules,
      cwd: root,
      resolveProjectRoot: async () => root,
    });
    assert.deepEqual(JSON.parse(output), {
      format: "hypit.cli-environment-programs@1",
      environment: profile,
      action: "status",
      ok: true,
      programCount: 0,
      readyCount: 0,
      programs: [],
    });
    await assert.rejects(runCliApplication(["programs", "status"], { write() {} }, {
      commandModules: modules,
      cwd: root,
      resolveProjectRoot: async () => root,
    }), /requires an Environment Profile/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
