import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { findProjectRoot } from "../src/project-context.js";

test("project discovery finds the marked package.json above cwd", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hypit-project-")));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "video", hypit: { project: true } }));
    await mkdir(join(root, "scenes", "intro"), { recursive: true });
    assert.equal(await findProjectRoot({ cwd: join(root, "scenes", "intro") }), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a package.json that is not JSON is named when it stops discovery", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hypit-project-")));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "video", hypit: { project: true } }));
    await mkdir(join(root, "sub"), { recursive: true });
    const broken = join(root, "sub", "package.json");
    await writeFile(broken, '{ "name": "sub", }');
    await assert.rejects(findProjectRoot({ cwd: join(root, "sub") }),
      (error: Error) => error.message.startsWith(`${broken} is not valid JSON: `) && error.cause instanceof SyntaxError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
