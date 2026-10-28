import assert from "node:assert/strict";
import test from "node:test";

import { commandHint } from "../../src/command-hint.js";

test("PowerShell command hints quote paths as literal strings", () => {
  assert.equal(commandHint(["status", "build-1", "--watch"], {
    projectRoot: "C:\\Films\\director's cut", runtimeProfile: "C:\\$profiles\\voice`new.json",
  }, "powershell"), "hypit status build-1 --watch --project 'C:\\Films\\director''s cut' --runtime 'C:\\$profiles\\voice`new.json'");
});
