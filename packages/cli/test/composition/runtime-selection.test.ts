import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { CliDistribution } from "../../src/distribution.js";
import { parseCommand } from "../../src/arguments.js";
import { runCliApplication } from "../../src/application.js";
import type { CliIo } from "../../src/output.js";
import { resolveProjectRoot } from "@hypit/project";
import { findRuntimeProfile, selectRuntimeProfile } from "@hypit/runtime-local";
import { createLocalRuntimeCliCommandModules } from "@hypit/runtime-local/cli";
import type { LocalRuntimeCliDistribution } from "@hypit/runtime-local/cli";
import type { LocalRuntimeHost } from "@hypit/runtime-local";
import { cliDistribution } from "../distribution-scenario.js";
import { runtimeControl } from "../control-scenario.js";

const runCli = async (
  argv: readonly string[],
  io: CliIo,
  distribution: CliDistribution,
  local: Pick<LocalRuntimeCliDistribution, "initialRuntimeProfile"> = {},
): Promise<void> =>
  await runCliApplication(argv, io, {
    distribution: {
      ...distribution,
      resolveProjectRuntime: async (projectRoot) => {
        const selected = await findRuntimeProfile(projectRoot);
        return selected === undefined ? undefined : { profile: selected.profile };
      },
    },
    commandModules: createLocalRuntimeCliCommandModules({
      ...(distribution.packageRoot === undefined ? {} : { packageRoot: distribution.packageRoot }),
      ...(local.initialRuntimeProfile === undefined
        ? {}
        : { initialRuntimeProfile: local.initialRuntimeProfile }),
      openLocalRuntimeHost: async (path, options) =>
        await distribution.openRuntimeHost(path, options) as LocalRuntimeHost,
    }),
  });

test("check has no Runtime context", () => {
  assert.throws(
    () => parseCommand(["check", "main.svml", "--runtime", "runtime.json"]),
    /--runtime does not apply to check/u,
  );
});

test("Runtime-aware commands accept an explicit project without changing relative argument paths", () => {
  const project = resolve("another-project");
  for (const command of [
    ["doctor"], ["status", "build-id"], ["activity"], ["cancel", "build-id"],
    ["auth", "status", "endpoint"], ["auth", "login", "endpoint"], ["auth", "logout", "endpoint"],
  ]) {
    const parsed = parseCommand([...command, "--project", project, "--runtime", "chosen.json"]);
    assert.ok("projectRoot" in parsed && "runtimeProfile" in parsed, command.join(" "));
    assert.equal(parsed.projectRoot, project);
    assert.equal(parsed.runtimeProfile, resolve("chosen.json"));
  }
  assert.throws(() => parseCommand(["doctor", "one.json", "--runtime", "two.json"]), /not both/u);
});

test("argument paths resolve from the application working directory", () => {
  const cwd = resolve("alternate-cwd");
  const parsed = parseCommand([
    "build", "main.svml", "--target", "final.video", "--project", "film", "--runtime", "profiles/local.json",
  ], cwd);
  assert.ok("projectRoot" in parsed && "runtimeProfile" in parsed);
  assert.equal(parsed.projectRoot, join(cwd, "film"));
  assert.equal(parsed.runtimeProfile, join(cwd, "profiles", "local.json"));
});

test("paths reports project selection, argument override and no selection without changing the pointer", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-path-context-"));
  try {
    const profile = join(root, "selected.json");
    const override = join(root, "override.json");
    await writeFile(profile, "{}\n");
    await writeFile(override, "{}\n");
    const distribution = cliDistribution({
      openRuntimeHost: async (path: string) => ({ resolvePaths: async () => ({ runtimeDataRoot: `${path}.data` }) }),
    });
    const readPaths = async (options: string[] = []) => {
      let output = "";
      await runCli(["paths", "--project", root, "--json", ...options],
        { write(text) { output += text; } }, distribution);
      return JSON.parse(output);
    };
    const absent = await readPaths();
    assert.equal(absent.project, await realpath(root));
    assert.equal(absent.profileSource, "none");
    assert.equal(absent.profile, undefined);
    assert.equal(absent.selectionFile, join(await realpath(root), ".hypit", "runtime"));
    const selected = await selectRuntimeProfile(root, profile);
    const project = await readPaths();
    assert.equal(project.profileSource, "project");
    assert.equal(project.profile, selected.profile);
    const explicit = await readPaths(["--runtime", override]);
    assert.equal(explicit.profileSource, "argument");
    assert.equal(explicit.profile, override);
    assert.equal((await readPaths()).profile, selected.profile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project resolution precedes exact project Runtime selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-selection-"));
  try {
    const nested = join(root, "sources", "chapter");
    const profile = join(root, "runtime", "local.json");
    await mkdir(nested, { recursive: true });
    await mkdir(join(root, "runtime"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"hypit":{"project":true}}\n', "utf8");
    await writeFile(profile, "{}\n", "utf8");

    const selected = await selectRuntimeProfile(root, profile);
    assert.equal(selected.profile, await realpath(profile));
    assert.equal((await readFile(join(root, ".hypit", "runtime"), "utf8")).trim(), join("runtime", "local.json"));

    assert.equal(await findRuntimeProfile(nested), undefined);
    const project = await resolveProjectRoot({ cwd: nested });
    assert.equal(project, await realpath(root));
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
    await writeFile(join(child, "package.json"), '{"hypit":{"project":true}}\n', "utf8");
    await writeFile(profile, "{}\n", "utf8");
    await selectRuntimeProfile(parent, profile);

    const project = await resolveProjectRoot({ cwd: child });
    assert.equal(project, await realpath(child));
    assert.equal(await findRuntimeProfile(project), undefined);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("project discovery chooses the caller's parent before resolving directory aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-alias-"));
  try {
    const caller = join(root, "caller");
    const targetParent = join(root, "target");
    const target = join(targetParent, "nested");
    await mkdir(caller);
    await mkdir(target, { recursive: true });
    await writeFile(join(caller, "package.json"), '{"hypit":{"project":true}}');
    await writeFile(join(targetParent, "package.json"), '{"hypit":{"project":true}}');
    const alias = join(caller, "linked");
    await symlink(target, alias, "junction");
    assert.equal(await resolveProjectRoot({ cwd: alias }), await realpath(caller));
    assert.equal(await resolveProjectRoot({ projectRoot: alias }), await realpath(target));
    await assert.rejects(resolveProjectRoot({ projectRoot: join(root, "missing") }), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("project discovery skips nested component manifests and never invents a project", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-marker-"));
  try {
    const project = join(root, "film");
    const component = join(project, "packages", "scene");
    await mkdir(component, { recursive: true });
    await writeFile(join(project, "package.json"), '{"hypit":{"project":true}}');
    await writeFile(join(component, "package.json"), '{"name":"@film/scene"}');
    assert.equal(await resolveProjectRoot({ cwd: component }), await realpath(project));

    const unrelated = join(root, "ordinary-package");
    await mkdir(unrelated);
    await writeFile(join(unrelated, "package.json"), '{"name":"ordinary"}');
    await assert.rejects(resolveProjectRoot({ cwd: unrelated }), /No Hypit project was found/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime use lets later CLI commands reuse the selected Profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-cli-"));
  const previous = process.cwd();
  try {
    const profile = join(root, "hypit.runtime.json");
    const otherProfile = join(root, "other.runtime.json");
    await writeFile(join(root, "package.json"), '{"hypit":{"project":true}}\n', "utf8");
    await writeFile(profile, "{}\n", "utf8");
    await writeFile(otherProfile, "{}\n", "utf8");
    const calls: string[] = [];
    const control = runtimeControl({
      async activity() { return { builds: [], capacity: [] }; },
    });
    const distribution = cliDistribution({
      openRuntimeHost: async (path: string) => ({
        profile: path,
        resolvePaths: async () => ({}),
        openControl: async () => {
          calls.push(`activity:${resolve(path)}`);
          return control;
        },
        executionStatus: async () => ({ state: "stopped" as const }),
        controller: async () => ({
          worker: { status: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }) },
        }),
      }),
    });
    process.chdir(root);

    await runCli(["runtime", "use", profile, "--project", root, "--json"], { write() {} }, distribution);
    await runCli(["activity", "--json"], { write() {} }, distribution);
    await runCli(["activity", "--runtime", otherProfile, "--json"], { write() {} }, distribution);
    await runCli(["runtime", "unset", "--project", root, "--json"], { write() {} }, distribution);

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

test("runtime init writes and selects the Distribution starter without opening a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-init-"));
  const previous = process.cwd();
  try {
    await writeFile(join(root, "package.json"), '{"hypit":{"project":true}}\n', "utf8");
    process.chdir(root);
    let opened = false;
    const starter = {
      format: "hypit.runtime-local@1" as const,
      dataRoot: ".hypit/runtimes/local",
      credentials: {},
      endpoints: {},
    };
    const distribution = cliDistribution({
      openRuntimeHost: async () => {
        opened = true;
        throw new Error("runtime init must not open the Runtime");
      },
    });
    let output = "";
    await runCli(["runtime", "init", "--project", root], {
      write(text) { output += text; },
    }, distribution, { initialRuntimeProfile: starter });

    const profile = join(root, "hypit.runtime.json");
    assert.deepEqual(JSON.parse(await readFile(profile, "utf8")), starter);
    assert.equal((await findRuntimeProfile(root))?.profile, await realpath(profile));
    assert.equal(opened, false);
    assert.match(output, /No package was installed, no service was contacted and no Worker was started/u);

    await assert.rejects(
      runCli(["runtime", "init", "--project", root], { write() {} }, distribution, { initialRuntimeProfile: starter }),
      /Runtime Profile already exists/u,
    );
    assert.deepEqual(JSON.parse(await readFile(profile, "utf8")), starter);
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime status without a selected Profile reports the missing context instead of generic usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-missing-"));
  const previous = process.cwd();
  try {
    await writeFile(join(root, "package.json"), '{"hypit":{"project":true}}\n', "utf8");
    process.chdir(root);
    await assert.rejects(
      async () => await runCli(["runtime", "status"], { write() {} }, cliDistribution()),
      /runtime requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>/u,
    );
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});


test("Runtime selection explains a directory collision without changing its contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-collision-"));
  try {
    const selection = join(root, ".hypit", "runtime");
    await mkdir(selection, { recursive: true });
    await writeFile(join(selection, "kept.txt"), "runtime data");
    const profile = join(root, "hypit.runtime.json");
    await writeFile(profile, "{}\n");
    await assert.rejects(findRuntimeProfile(root), /Runtime selection must be a file:.*occupied by a directory/u);
    await assert.rejects(selectRuntimeProfile(root, profile), /Runtime selection must be a file:.*occupied by a directory/u);
    assert.equal(await readFile(join(selection, "kept.txt"), "utf8"), "runtime data");
  } finally { await rm(root, { recursive: true, force: true }); }
});
