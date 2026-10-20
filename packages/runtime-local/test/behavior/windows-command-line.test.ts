import assert from "node:assert/strict";
import test from "node:test";
import { windowsCommandLine } from "../../src/programs.js";

test("Windows arguments preserve spaces, quotes and trailing backslashes", () => {
  assert.equal(windowsCommandLine(["plain", "", "two words"]), 'plain "" "two words"');
  assert.equal(windowsCommandLine(['say "hi"']), String.raw`"say \"hi\""`);
  assert.equal(windowsCommandLine(["C:\\Program Files\\"]), String.raw`"C:\Program Files\\"`);
  assert.equal(windowsCommandLine([`prefix ${"\\".repeat(2)}"suffix`]), `"prefix ${"\\".repeat(5)}"suffix"`);
});
