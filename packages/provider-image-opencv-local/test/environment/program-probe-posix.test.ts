import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { localOpenCvProgram } from "../../src/program.js";
import { resolveLocalOpenCvDeployment } from "../../src/deployment.js";

test("an interpreter carrying another OpenCV major is a mismatch, not a failure", {
  skip: process.platform === "win32" && "the stand-in interpreter answers through a shebang",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-opencv-probe-"));
  const fake = join(directory, "python");
  await writeFile(fake, "#!/bin/sh\necho '{\"cv2\": \"3.4.18\", \"numpy\": \"2.1.0\"}'\n", { mode: 0o755 });
  try {
    const selected = {
      hostStateRoot: join(tmpdir(), "hypit-opencv-host"),
      dataRoot: process.cwd(),
      instance: "opencv.test",
      pythonExecutable: fake,
    };
    const state = await localOpenCvProgram(selected.instance, resolveLocalOpenCvDeployment(selected)).probe();
    assert.equal(state.state, "mismatch");
    assert.match(state.state === "mismatch" ? state.detail : "", /cv2 is 3\.4\.18, expected 4\.x/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an interpreter without cv2 is down, not accepted until a Build fails", {
  skip: process.platform === "win32" && "/usr/bin/false is a POSIX test fixture",
}, async () => {
  const selected = {
    hostStateRoot: join(tmpdir(), "hypit-opencv-host"),
    dataRoot: process.cwd(),
    instance: "opencv.test",
    pythonExecutable: "/usr/bin/false",
  };
  const state = await localOpenCvProgram(selected.instance, resolveLocalOpenCvDeployment(selected)).probe();
  assert.equal(state.state, "down");
  assert.match(state.state === "down" ? state.detail : "", /cannot import cv2 and numpy/u);
});
