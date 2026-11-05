import assert from "node:assert/strict";
import test from "node:test";
import { powershellLiteral } from "../src/programs.js";

test("PowerShell literals escape every quote form the tokenizer accepts", () => {
  assert.equal(powershellLiteral("plain"), "'plain'");
  assert.equal(powershellLiteral("it's"), "'it''s'");
  // Windows PowerShell accepts U+2018–U+201B as quote delimiters too; each must
  // double or the literal ends early and reopens script parsing.
  assert.equal(powershellLiteral("it’s"), "'it’’s'");
  assert.equal(powershellLiteral("a‘b‚c‛d"), "'a‘‘b‚‚c‛‛d'");
});
