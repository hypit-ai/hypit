import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { CliDistribution } from "../src/distribution.js";
import { parseCommand } from "../src/arguments.js";
import { runCli } from "../src/main.js";
import { resolveProjectRoot } from "../src/project-context.js";
import type { CliRuntimeControl } from "../src/runtime-port.js";
import { findRuntimeProfile, selectRuntimeProfile } from "../src/runtime-selection.js";

test("check has no Runtime context", () => {
  assert.throws(
    () => parseCommand(["check", "main.svml", "--runtime", "runtime.json"]),
    /--runtime does not apply to check/u,
  );
});

test("project resolution precedes exact project Runtime selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-selection-"));
  try {
    const nested = join(root, "sources", "chapter");
    const profile = join(root, "runtime", "local.json");
    await mkdir(nested, { recursive: true });
    await mkdir(join(root, "runtime"), { recursive: true });
    await writeFile(join(root, "package.json"), "{}\n", "utf8");
    await writeFile(profile, "{}\n", "utf8");

    const selected = await selectRuntimeProfile(root, profile);
    assert.equal(selected.profile, await realpath(profile));
    assert.equal((await readFile(join(root, ".hypit", "runtime"), "utf8")).trim(), join("runtime", "local.json"));

    assert.equal(await findRuntimeProfile(nested), undefined);
    const project = await resolveProjectRoot({ cwd: nested });
    assert.equal(project, resolve(root));
    const found = await findRuntimeProfile(project);
    assert.equal(found?.profile, selected.profile);
    assert.equal(await realpath(found!.projectRoot), selected.projectRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a parent Runtime selection never becomes a child project's selection", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-runtime-parent-"));
  try {
    const child = join(parent, "child");
    const profile = join(parent, "runtime.json");
    await mkdir(child, { recursive: true });
    await writeFile(join(child, "package.json"), "{}\n", "utf8");
    await writeFile(profile, "{}\n", "utf8");
    await selectRuntimeProfile(parent, profile);

    const project = await resolveProjectRoot({ cwd: child });
    assert.equal(project, resolve(child));
    assert.equal(await findRuntimeProfile(project), undefined);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("runtime use lets later CLI commands reuse the selected Profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-cli-"));
  const previous = process.cwd();
  try {
    const profile = join(root, "hypit.runtime.json");
    const otherProfile = join(root, "other.runtime.json");
    await writeFile(profile, "{}\n", "utf8");
    await writeFile(otherProfile, "{}\n", "utf8");
    const calls: string[] = [];
    const control = {
      async activity() { return { builds: [], capacity: [] }; },
      async close() {},
    } as unknown as CliRuntimeControl;
    const distribution = {
      openRuntimeHost: async (path: string) => ({
        profile: path,
        resolvePaths: async () => ({}),
        openControl: async () => {
          calls.push(`activity:${resolve(path)}`);
          return control;
        },
        controller: async () => ({
          worker: { status: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }) },
        }),
      }),
    } as unknown as CliDistribution;
    process.chdir(root);

    await runCli(["runtime", "use", profile, "--workspace", root, "--json"], { write() {} }, distribution);
    await runCli(["activity", "--json"], { write() {} }, distribution);
    await runCli(["activity", "--runtime", otherProfile, "--json"], { write() {} }, distribution);
    await runCli(["runtime", "unset", "--workspace", root, "--json"], { write() {} }, distribution);

    assert.deepEqual(calls, [
      `activity:${await realpath(profile)}`,
      `activity:${otherProfile}`,
    ]);
    assert.equal(await findRuntimeProfile(root), undefined);
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime status without a selected Profile reports the missing context instead of generic usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-missing-"));
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
