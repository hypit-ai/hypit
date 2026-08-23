import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";

import { localOpenCvProgram } from "../src/program.js";

const context = (config: Record<string, unknown> = {}) => ({
  hostStateRoot: join(tmpdir(), "hypit-opencv-host"),
  dataRoot: process.cwd(), instance: "opencv.test", config: config as never,
});

test("OpenCV declares how to install its interpreter and nothing to keep running", () => {
  const program = localOpenCvProgram(context());
  assert.equal(program.id, "image-opencv");
  assert.equal(program.start, undefined, "OpenCV runs per Need; there is no daemon to start");
  // Absolute: a Runtime root is wherever the Profile lives, not where the
  // pinned uv project lives.
  assert.equal(program.installation?.commands[0]?.command, "uv");
  assert.equal(program.installation?.commands[0]?.args.at(-1), "--frozen");
  const project = program.installation?.commands[0]?.args.at(-2) ?? "";
  assert.ok(isAbsolute(project), `${project} must be absolute`);
  assert.ok(existsSync(join(project, "pyproject.toml")), `${project} must be the pinned uv project`);
  assert.equal(program.stateRoot, join(context().hostStateRoot, "programs", "image-opencv"));
});

test("an interpreter without cv2 is reported here, not mid-Build", async () => {
  // `false` exits non-zero without printing a version report.
  const state = await localOpenCvProgram(context({ pythonExecutable: "/usr/bin/false" })).probe();
  assert.equal(state.state, "down");
  assert.match(state.state === "down" ? state.detail : "", /cannot import cv2 and numpy/u);
});

test("an interpreter carrying another OpenCV major is a mismatch, not a failure", {
  // The stand-in below is a shell script that answers through its shebang line, and Windows has
  // no shebang: it would run nothing and report the interpreter down, which is the state this
  // test exists to distinguish a mismatch from.
  skip: process.platform === "win32" && "the stand-in interpreter answers through a shebang",
}, async () => {
  // A stand-in interpreter that answers truthfully about an environment this
  // Provider cannot drive: cv2 3.x predates the APIs it calls.
  const directory = await mkdtemp(join(tmpdir(), "hypit-opencv-probe-"));
  const fake = join(directory, "python");
  await writeFile(fake, "#!/bin/sh\necho '{\"cv2\": \"3.4.18\", \"numpy\": \"2.1.0\"}'\n", { mode: 0o755 });
  try {
    const state = await localOpenCvProgram(context({ pythonExecutable: fake })).probe();
    assert.equal(state.state, "mismatch");
    assert.match(state.state === "mismatch" ? state.detail : "", /cv2 is 3\.4\.18, expected 4\.x/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the major versions the probe demands are the ones the packaged project installs", async () => {
  const project = localOpenCvProgram(context()).installation?.commands[0]?.args.at(-2);
  assert.ok(project);
  const pyproject = await readFile(join(project, "pyproject.toml"), "utf8");
  assert.match(pyproject, /"opencv-python-headless>=4\./u, "probe expects cv2 4.x");
  assert.match(pyproject, /"numpy>=2\./u, "probe expects numpy 2.x");
});
