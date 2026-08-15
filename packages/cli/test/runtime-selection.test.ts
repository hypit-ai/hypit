import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { CliDistribution } from "../src/distribution.js";
import { runCli } from "../src/main.js";
import type { CliRuntimeArchiveControl } from "../src/runtime-port.js";
import { findRuntimeProfile, selectRuntimeProfile } from "../src/runtime-selection.js";

test("project Runtime selection is a relative local pointer discovered from nested sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-selection-"));
  try {
    const nested = join(root, "sources", "chapter");
    const profile = join(root, "runtime", "local.json");
    await mkdir(nested, { recursive: true });
    await mkdir(join(root, "runtime"), { recursive: true });
    await writeFile(profile, "{}\n", "utf8");

    const selected = await selectRuntimeProfile(root, profile);
    assert.equal(selected.profile, await realpath(profile));
    assert.equal((await readFile(join(root, ".narratage", "runtime"), "utf8")).trim(), join("runtime", "local.json"));

    const found = await findRuntimeProfile(nested);
    assert.equal(found?.profile, selected.profile);
    assert.equal(await realpath(found!.projectRoot), selected.projectRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime use lets later CLI commands reuse the selected Profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-cli-"));
  const previous = process.cwd();
  try {
    const profile = join(root, "narratage.runtime.json");
    const otherProfile = join(root, "other.runtime.json");
    await writeFile(profile, "{}\n", "utf8");
    await writeFile(otherProfile, "{}\n", "utf8");
    const calls: string[] = [];
    const control = {
      async queue() { return { dispatches: [], capacity: [], operations: [] }; },
      async close() {},
    } as unknown as CliRuntimeArchiveControl;
    const distribution = {
      openRuntimeHost: async (path: string) => ({
        profile: path,
        resolvePaths: async () => ({}),
        openArchive: async () => {
          calls.push(`queue:${resolve(path)}`);
          return control;
        },
        controller: async () => ({
          worker: { status: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }) },
        }),
      }),
    } as unknown as CliDistribution;
    process.chdir(root);

    await runCli(["runtime", "use", profile, "--json"], { write() {} }, distribution);
    await runCli(["queue", "--json"], { write() {} }, distribution);
    await runCli(["queue", "--runtime", otherProfile, "--json"], { write() {} }, distribution);
    await runCli(["runtime", "unset", "--json"], { write() {} }, distribution);

    assert.deepEqual(calls, [
      `queue:${await realpath(profile)}`,
      `queue:${otherProfile}`,
    ]);
    assert.equal(await findRuntimeProfile(root), undefined);
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime status without a selected Profile reports the missing context instead of generic usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-runtime-missing-"));
  const previous = process.cwd();
  try {
    process.chdir(root);
    await assert.rejects(
      async () => await runCli(["runtime", "status"], { write() {} }, {} as CliDistribution),
      /runtime requires a Runtime Profile/u,
    );
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});
