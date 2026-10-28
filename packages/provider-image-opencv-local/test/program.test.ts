import assert from "node:assert/strict";
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
