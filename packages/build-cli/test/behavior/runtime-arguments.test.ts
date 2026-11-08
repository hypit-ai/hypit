import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";

import { parseCommand } from "@hypit/build-operations-cli";

test("check has no Runtime context", () => {
  assert.throws(
    () => parseCommand(["check", "main.svml", "--runtime", "runtime.json"]),
    /--runtime does not apply to check/u,
  );
});

test("Runtime-aware commands accept an explicit project without changing relative argument paths", () => {
  const project = resolve("another-project");
  for (const command of [
    ["doctor"], ["status", "build-id"], ["activity"], ["cancel", "build-id"],
    ["auth", "status", "endpoint"], ["auth", "login", "endpoint"], ["auth", "logout", "endpoint"],
  ]) {
    const parsed = parseCommand([...command, "--project", project, "--runtime", "chosen.json"]);
    assert.ok("projectRoot" in parsed && "runtimeProfile" in parsed, command.join(" "));
    assert.equal(parsed.projectRoot, project);
    assert.equal(parsed.runtimeProfile, resolve("chosen.json"));
  }
  assert.throws(() => parseCommand(["doctor", "one.json", "--runtime", "two.json"]), /not both/u);
});

test("argument paths resolve from the application working directory", () => {
  const cwd = resolve("alternate-cwd");
  const parsed = parseCommand([
    "build", "main.svml", "--target", "final.video", "--project", "film", "--runtime", "profiles/local.json",
  ], cwd);
  assert.ok("projectRoot" in parsed && "runtimeProfile" in parsed);
  assert.equal(parsed.projectRoot, join(cwd, "film"));
  assert.equal(parsed.runtimeProfile, join(cwd, "profiles/local.json"));
});
