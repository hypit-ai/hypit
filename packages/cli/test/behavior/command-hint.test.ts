import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { commandHint } from "../../src/command-hint.js";

test("POSIX command hints preserve selectors and literal path characters when copied", { skip: process.platform === "win32" }, () => {
  const args = ["get", "build-1", "--output", "scene's $draft `name`", "--to", ""];
  const projectRoot = "/tmp/film $(printf changed)";
  const runtimeProfile = "/tmp/voice & picture/profile.json";
  const command = commandHint(args, { projectRoot, runtimeProfile }, "posix");
  const output = execFileSync("/bin/sh", ["-c",
    `hypit() { "$HINT_TEST_NODE" -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- "$@"; }; ${command}`,
  ], { encoding: "utf8", env: { ...process.env, HINT_TEST_NODE: process.execPath } });
  assert.deepEqual(JSON.parse(output), [...args, "--project", projectRoot, "--runtime", runtimeProfile]);
});

test("PowerShell command hints quote paths as literal strings", () => {
  assert.equal(commandHint(["status", "build-1", "--watch"], {
    projectRoot: "C:\\Films\\director's cut", runtimeProfile: "C:\\$profiles\\voice`new.json",
  }, "powershell"), "hypit status build-1 --watch --project 'C:\\Films\\director''s cut' --runtime 'C:\\$profiles\\voice`new.json'");
});
