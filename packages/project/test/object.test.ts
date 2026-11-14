import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProjectObjectRef,
  projectObjectRef,
  projectObjectRefKey,
} from "../src/index.js";

test("a Project Object is identified by its boundary-relative path and exact owner format", () => {
  const object = projectObjectRef("episode-01/final.nle.json", "hypit.nle@1");
  assert.deepEqual(object, {
    path: "episode-01/final.nle.json",
    format: "hypit.nle@1",
  });
  assert.equal(projectObjectRefKey(object), "hypit.nle@1\u0000episode-01/final.nle.json");
});

test("Project Object references do not guess paths outside their selected boundary", () => {
  for (const path of ["../film.nle.json", "/film.nle.json", "episode\\film.nle.json", "a/./film.nle.json"]) {
    assert.throws(() => projectObjectRef(path, "hypit.nle@1"), /Project Object path/u);
  }
  assert.doesNotThrow(() => assertProjectObjectRef({
    path: "film.nle.json",
    format: "hypit.nle@2",
  }));
  assert.throws(() => assertProjectObjectRef({
    path: "film.nle.json",
    format: "hypit.nle",
  }), /exact format major/u);
});
