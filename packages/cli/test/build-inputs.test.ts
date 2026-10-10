import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareBuildInputs } from "../src/build-inputs.js";

async function projectWithBuildInput(command: string, inputs = ["source.txt"]) {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-inputs-"));
  await writeFile(join(root, "source.txt"), "source\n");
  await writeFile(join(root, "package.json"), JSON.stringify({
    hypit: { buildInputs: [{ id: "fixture", command, inputs, outputs: ["generated.txt"] }] },
  }));
  return root;
}

test("build inputs run once and reuse a matching fingerprint", async () => {
  const root = await projectWithBuildInput("node -e \"require('node:fs').writeFileSync('generated.txt', 'ready')\"");
  try {
    const reports: string[] = [];
    await prepareBuildInputs(root, (line) => reports.push(line));
    await prepareBuildInputs(root, (line) => reports.push(line));
    assert.deepEqual(reports, ["Build input fixture: running", "Build input fixture: ready", "Build input fixture: up to date"]);
    assert.equal(await readFile(join(root, "generated.txt"), "utf8"), "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build inputs rebuild when edits preserve the concatenated file bytes", async () => {
  const root = await projectWithBuildInput(
    "node -e \"const fs=require('node:fs');fs.writeFileSync('generated.txt', fs.readFileSync('a','utf8')+':'+fs.readFileSync('b','utf8'))\"",
    ["a", "b"],
  );
  try {
    await writeFile(join(root, "a"), "x");
    await writeFile(join(root, "b"), "by");
    await prepareBuildInputs(root, () => {});
    assert.equal(await readFile(join(root, "generated.txt"), "utf8"), "x:by");
    await writeFile(join(root, "a"), "xb");
    await writeFile(join(root, "b"), "y");
    await prepareBuildInputs(root, () => {});
    assert.equal(await readFile(join(root, "generated.txt"), "utf8"), "xb:y");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build inputs persist IDs that match object prototype properties", async () => {
  const root = await projectWithBuildInput("node -e \"require('node:fs').writeFileSync('generated.txt', 'ready')\"");
  try {
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.hypit.buildInputs[0].id = "__proto__";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const reports: string[] = [];
    await prepareBuildInputs(root, (line) => reports.push(line));
    await prepareBuildInputs(root, (line) => reports.push(line));
    assert.deepEqual(reports, ["Build input __proto__: running", "Build input __proto__: ready", "Build input __proto__: up to date"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build inputs follow directory symlinks when fingerprinting glob inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-inputs-link-"));
  const target = await mkdtemp(join(tmpdir(), "hypit-build-inputs-target-"));
  const reports: string[] = [];
  try {
    await writeFile(join(target, "scene.py"), "one", "utf8");
    await symlink(target, join(root, "shared"), "dir");
    await writeFile(join(root, "package.json"), JSON.stringify({
      hypit: { buildInputs: [{
        id: "linked",
        command: `node -e "require('node:fs').writeFileSync('generated.txt', 'ready')"`,
        inputs: ["shared/**/*.py"],
        outputs: ["generated.txt"],
      }] },
    }));
    await prepareBuildInputs(root, (line) => reports.push(line));
    await writeFile(join(target, "scene.py"), "two", "utf8");
    await prepareBuildInputs(root, (line) => reports.push(line));
    assert.equal(reports.filter((line) => line === "Build input linked: running").length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("build input glob traversal stays under its fixed prefix and terminates directory symlink cycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-inputs-cycle-"));
  const target = await mkdtemp(join(tmpdir(), "hypit-build-inputs-external-"));
  const reports: string[] = [];
  try {
    await mkdir(join(root, "scenes"));
    await mkdir(join(root, "unrelated"));
    await writeFile(join(root, "scenes", "scene.py"), "scene", "utf8");
    await writeFile(join(root, "unrelated", "noise.py"), "noise", "utf8");
    await symlink(".", join(root, "scenes", "loop"), "dir");
    await symlink(".", join(root, "unrelated", "loop"), "dir");
    await symlink(target, join(root, "scenes", "external"), "dir");
    await writeFile(join(target, "linked.py"), "one", "utf8");
    await writeFile(join(root, "package.json"), JSON.stringify({
      hypit: { buildInputs: [{
        id: "scenes",
        command: `node -e "require('node:fs').writeFileSync('generated.txt', 'ready')"`,
        inputs: ["scenes/**/*.py"],
        outputs: ["generated.txt"],
      }] },
    }));

    await prepareBuildInputs(root, (line) => reports.push(line));
    await writeFile(join(root, "unrelated", "noise.py"), "changed but irrelevant", "utf8");
    await writeFile(join(target, "linked.py"), "two", "utf8");
    await prepareBuildInputs(root, (line) => reports.push(line));

    assert.equal(reports.filter((line) => line === "Build input scenes: running").length, 2);
    assert.equal(reports.at(-1), "Build input scenes: ready");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("build input glob preserves distinct aliases to the same symlink target", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-inputs-alias-"));
  const target = await mkdtemp(join(tmpdir(), "hypit-build-inputs-alias-target-"));
  try {
    await mkdir(join(target, "nested"));
    await writeFile(join(target, "nested", "scene.py"), "scene", "utf8");
    await symlink(target, join(root, "first"), "dir");
    await symlink(target, join(root, "second"), "dir");
    await writeFile(join(root, "package.json"), JSON.stringify({
      hypit: { buildInputs: [{
        id: "aliases",
        command: `node -e "require('node:fs').writeFileSync('generated.txt', 'ready')"`,
        inputs: ["*/*/*.py"],
        outputs: ["generated.txt"],
      }] },
    }));

    await prepareBuildInputs(root, () => {});
    const state = JSON.parse(await readFile(join(root, ".hypit", "build-inputs.json"), "utf8"));
    assert.equal(typeof state.aliases, "string");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("failed rebuild clears its cached success so the next invocation retries", async () => {
  const root = await projectWithBuildInput(
    "node -e \"const fs=require('node:fs');if(fs.readFileSync('mode','utf8')==='fail'){fs.writeFileSync('generated.txt','partial');process.exit(1)}fs.writeFileSync('generated.txt','ready')\"",
  );
  try {
    await writeFile(join(root, "mode"), "ready", "utf8");
    await prepareBuildInputs(root, () => {});
    await unlink(join(root, "generated.txt"));
    await writeFile(join(root, "mode"), "fail", "utf8");
    await assert.rejects(prepareBuildInputs(root, () => {}), /Build input fixture failed/);
    await writeFile(join(root, "mode"), "ready", "utf8");
    const reports: string[] = [];
    await prepareBuildInputs(root, (line) => reports.push(line));
    assert.deepEqual(reports, ["Build input fixture: running", "Build input fixture: ready"]);
    assert.equal(await readFile(join(root, "generated.txt"), "utf8"), "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed later hook preserves earlier successful cache entries", async () => {
  const root = await projectWithBuildInput("node -e \"require('node:fs').writeFileSync('generated.txt', 'ready')\"");
  try {
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.hypit.buildInputs.push({
      id: "later",
      command: "exit 1",
      inputs: ["source.txt"],
      outputs: ["later.txt"],
    });
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(prepareBuildInputs(root, () => {}), /Build input later failed/);
    const state = JSON.parse(await readFile(join(root, ".hypit", "build-inputs.json"), "utf8"));
    assert.equal(typeof state.fixture, "string");
    assert.equal(Object.hasOwn(state, "later"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
