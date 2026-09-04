import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";

import { localOpenCvProgram } from "../src/program.js";
import { resolveLocalOpenCvDeployment } from "../src/deployment.js";

const context = (pythonExecutable?: string) => ({
  hostStateRoot: join(tmpdir(), "hypit-opencv-host"),
  dataRoot: process.cwd(), instance: "opencv.test",
  ...(pythonExecutable === undefined ? {} : { pythonExecutable }),
});

test("OpenCV declares how to install its interpreter and nothing to keep running", () => {
  const selected = context();
  const program = localOpenCvProgram(selected.instance, resolveLocalOpenCvDeployment(selected));
  assert.equal(program.id, "opencv.test");
  assert.equal(program.start, undefined, "OpenCV runs per Need; there is no daemon to start");
  // Absolute: a Runtime root is wherever the Profile lives, not where the
  // pinned uv project lives.
  assert.equal(program.installation?.commands[0]?.command, "uv");
  assert.equal(program.installation?.commands[0]?.args.at(-1), "--frozen");
  const project = program.installation?.commands[0]?.args.at(-2) ?? "";
  assert.ok(isAbsolute(project), `${project} must be absolute`);
  assert.ok(existsSync(join(project, "pyproject.toml")), `${project} must be the pinned uv project`);
  assert.equal(program.stateRoot, join(context().hostStateRoot, "programs", "image-opencv-opencv.test"));
});

test("an interpreter without cv2 is reported here, not mid-Build", async () => {
  // `false` exits non-zero without printing a version report.
  const selected = context("/usr/bin/false");
  const state = await localOpenCvProgram(selected.instance, resolveLocalOpenCvDeployment(selected)).probe();
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
    const selected = context(fake);
    const state = await localOpenCvProgram(selected.instance, resolveLocalOpenCvDeployment(selected)).probe();
    assert.equal(state.state, "mismatch");
    assert.match(state.state === "mismatch" ? state.detail : "", /cv2 is 3\.4\.18, expected 4\.x/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
