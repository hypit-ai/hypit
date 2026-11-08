import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCliApplication } from "@hypit/cli";
import { findProjectRoot } from "@hypit/project";

import { createProjectCliCommandModules, initializeHypitProject } from "../src/index.js";

test("project init creates only the production boundary files", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-project-init-"));
  try {
    const root = join(parent, "Launch Film");
    const output: string[] = [];
    await runCliApplication(["project", "init", root, "--json"], { write: (text) => output.push(text) }, {
      cwd: parent,
      commandModules: createProjectCliCommandModules(),
    });

    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    assert.deepEqual(manifest, {
      name: "launch-film",
      version: "0.0.0",
      private: true,
      type: "module",
      hypit: { project: true },
    });
    assert.equal(await readFile(join(root, ".gitignore"), "utf8"), "node_modules/\n.hypit/\nexports/\n");
    assert.equal(await findProjectRoot({ cwd: root }), await realpath(root));
    assert.equal((JSON.parse(output.join("")) as { readonly format: string }).format, "hypit.project-init@1");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("project init adopts an npm package without replacing its fields or gitignore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-adopt-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), `${JSON.stringify({
      name: "existing-video",
      private: true,
      scripts: { render: "hypit nle export film.nle.json --to exports/film.mp4" },
      hypit: { note: "kept" },
    }, undefined, 2)}\n`);
    await writeFile(join(root, ".gitignore"), "custom/\n");

    const first = await initializeHypitProject({ directory: root });
    const second = await initializeHypitProject({ directory: root });
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      readonly scripts: unknown;
      readonly hypit: unknown;
    };
    assert.deepEqual(manifest.scripts, { render: "hypit nle export film.nle.json --to exports/film.mp4" });
    assert.deepEqual(manifest.hypit, { note: "kept", project: true });
    assert.equal(await readFile(join(root, ".gitignore"), "utf8"), "custom/\n");
    assert.equal(first.packageCreated, false);
    assert.equal(first.packageChanged, true);
    assert.equal(second.packageChanged, false);
    assert.equal(second.gitignoreCreated, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project init names malformed existing package JSON without replacing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-malformed-"));
  try {
    await writeFile(join(root, "package.json"), "{ broken");
    await assert.rejects(initializeHypitProject({ directory: root }),
      new RegExp(`Project manifest .*package\\.json is not valid JSON`, "u"));
    assert.equal(await readFile(join(root, "package.json"), "utf8"), "{ broken");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
