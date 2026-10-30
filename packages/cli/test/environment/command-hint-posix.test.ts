import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { commandHint } from "../../src/command-hint.js";

test("POSIX command hints preserve selectors and literal path characters when copied", {
  skip: process.platform === "win32",
}, () => {
  const args = ["result", "export", "build-1", "--output", "scene's $draft `name`", "--to", ""];
  const projectRoot = "/tmp/film $(printf changed)";
  const runtimeProfile = "/tmp/voice & picture/profile.json";
  const command = commandHint(args, { projectRoot, runtimeProfile }, "posix");
  const output = execFileSync("/bin/sh", ["-c",
    `hypit() { "$HINT_TEST_NODE" -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- "$@"; }; ${command}`,
  ], { encoding: "utf8", env: { ...process.env, HINT_TEST_NODE: process.execPath } });
  assert.deepEqual(JSON.parse(output), [...args, "--project", projectRoot, "--runtime", runtimeProfile]);
});
