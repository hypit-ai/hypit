import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { localOpenCvService } from "../src/service.js";

const context = (config: Record<string, unknown> = {}) => ({
  root: process.cwd(), instance: "opencv.test", config: config as never,
});

test("OpenCV declares how to install its interpreter and nothing to keep running", () => {
  const service = localOpenCvService(context());
  assert.equal(service.id, "image-opencv");
  assert.equal(service.start, undefined, "OpenCV runs per Need; there is no daemon to start");
  assert.deepEqual(service.prepare, {
    command: "uv",
    args: ["sync", "--project", "services/image-opencv", "--frozen"],
  });
});

test("an interpreter without cv2 is reported here, not mid-Build", async () => {
  // `false` exits non-zero without printing a version report.
  const state = await localOpenCvService(context({ pythonExecutable: "/usr/bin/false" })).probe();
  assert.equal(state.state, "down");
  assert.match(state.state === "down" ? state.detail : "", /cannot import cv2 and numpy/u);
});

test("an interpreter carrying another OpenCV major is a mismatch, not a failure", async () => {
  // A stand-in interpreter that answers truthfully about an environment this
  // Provider cannot drive: cv2 3.x predates the APIs it calls.
  const directory = await mkdtemp(join(tmpdir(), "svml-opencv-probe-"));
  const fake = join(directory, "python");
  await writeFile(fake, "#!/bin/sh\necho '{\"cv2\": \"3.4.18\", \"numpy\": \"2.1.0\"}'\n", { mode: 0o755 });
  try {
    const state = await localOpenCvService(context({ pythonExecutable: fake })).probe();
    assert.equal(state.state, "mismatch");
    assert.match(state.state === "mismatch" ? state.detail : "", /cv2 is 3\.4\.18, expected 4\.x/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the major versions the probe demands are the ones the locked project installs", async () => {
  const pyproject = await readFile(new URL("../../../services/image-opencv/pyproject.toml", import.meta.url), "utf8");
  assert.match(pyproject, /"opencv-python-headless>=4\./u, "probe expects cv2 4.x");
  assert.match(pyproject, /"numpy>=2\./u, "probe expects numpy 2.x");
});
