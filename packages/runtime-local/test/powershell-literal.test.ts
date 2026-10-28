import assert from "node:assert/strict";
import test from "node:test";

import { powershellLiteral } from "../src/programs.js";

test("PowerShell literals escape every single-quote delimiter", () => {
  assert.equal(powershellLiteral("it's"), "'it''s'");
  assert.equal(powershellLiteral("a‘b’c‚d‛e"), "'a‘‘b’’c‚‚d‛‛e'");
});
