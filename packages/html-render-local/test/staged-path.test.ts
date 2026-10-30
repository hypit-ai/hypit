import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { resolveStagedPath } from "../src/staged-path.js";

test("staged paths are relative to the resolved render project", () => {
  const root = resolve("render-project");
  assert.equal(resolveStagedPath(`${root}/`, "media/clip.mp4"), resolve(root, "media/clip.mp4"));
  assert.equal(resolveStagedPath(root, "..hidden/clip.mp4"), resolve(root, "..hidden/clip.mp4"));
  assert.equal(resolveStagedPath(root, "../outside.mp4"), undefined);
  assert.equal(resolveStagedPath(root, resolve(root, "media/clip.mp4")), resolve(root, "media/clip.mp4"));
  assert.equal(resolveStagedPath(root, resolve(root, "../outside.mp4")), undefined);
});
