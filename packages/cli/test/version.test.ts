import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runVersionCli } from "@hypit/cli";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("the launched Distribution ignores inherited installation and launcher hints", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const launcher = join(root, "bin", "hypit.mjs");
  const result = spawnSync(process.execPath, [launcher, "version", "--json"], {
    encoding: "utf8", windowsHide: true,
    env: { ...process.env, HYPIT_DISTRIBUTION_ROOT: join(tmpdir(), "old-hypit"), HYPIT_CLI_LAUNCHER: join(tmpdir(), "old-hypit.mjs") },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.distribution, join(root, "."));
  assert.equal(report.launcher, launcher);
});

test("version reads its Distribution without a project, Runtime or registry request", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-version-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@hypit/hypit", version: "0.1.8" }));
    let output = "";
    await runVersionCli(["version", "--json"], { write: (s) => { output += s; } }, {
      packageRoot: root, launcher: join(root, "bin", "hypit.mjs"),
      fetch: async () => { throw new Error("No network expected"); },
    });
    assert.deepEqual(JSON.parse(output), {
      format: "hypit.cli-version@1", package: "@hypit/hypit", version: "0.1.8",
      distribution: root, launcher: join(root, "bin", "hypit.mjs"),
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("version accepts the global presentation options", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-version-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@hypit/hypit", version: "0.1.8" }));
    const run = (argv: readonly string[]) => runVersionCli(["version", ...argv], { write: () => {} }, {
      packageRoot: root, launcher: join(root, "bin", "hypit.mjs"),
      fetch: async () => { throw new Error("No network expected"); },
    });
    for (const argv of [["--color", "never"], ["--color", "always"], ["--no-color"], ["--verbose"], ["--debug"]]) {
      await run(argv);
    }
    await assert.rejects(run(["--color", "sometimes"]), /--color requires auto, always or never/u);
    await assert.rejects(run(["--colour"]), /Unknown version option: --colour/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("version check reports the selected registry's evidence, including newer local checkouts", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-version-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@hypit/hypit", version: "0.1.9" }));
    let output = "";
    let calls = 0;
    await runVersionCli(["version", "--check", "--registry", "https://mirror.example/npm", "--json"], {
      write: (s) => { output += s; },
    }, { packageRoot: root, fetch: async (url, init) => {
      calls++;
      assert.equal(String(url), "https://mirror.example/npm/%40hypit%2Fhypit/latest");
      assert.equal(init?.method, undefined);
      return Response.json({ name: "@hypit/hypit", version: "0.1.8" });
    } });
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(output).latest, {
      registry: "https://mirror.example/npm/", version: "0.1.8", matchesInstalled: false,
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const mode of ["offline", "body-timeout", "wrong-package"] as const) {
  test(`version ${mode} retains local facts and marks latest as unknown`, async () => {
    const root = await mkdtemp(join(tmpdir(), "hypit-version-"));
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ name: "@hypit/hypit", version: "0.1.8" }));
      let output = "";
      let exitCode = 0;
      await runVersionCli(["version", "--check", "--json"], {
        write: (s) => { output += s; }, setExitCode: (code) => { exitCode = code; },
      }, { packageRoot: root, timeoutMs: 20, fetch: async () => {
        if (mode === "offline") throw new Error("offline");
        if (mode === "body-timeout") return new Response(new ReadableStream());
        return Response.json({ name: "different-package", version: "9.0.0" });
      } });
      const report = JSON.parse(output);
      assert.equal(report.version, "0.1.8");
      assert.equal(report.latest.version, undefined);
      assert.equal(report.latest.matchesInstalled, undefined);
      assert.ok(report.latest.error);
      assert.equal(exitCode, 1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
