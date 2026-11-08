import assert from "node:assert/strict";
import test from "node:test";

import { htmlTextSequenceRuntime } from "../src/index.js";

test("HTML text sequence runtime composes with path layout without domain knowledge", () => {
  assert.doesNotThrow(() => new Function(htmlTextSequenceRuntime));
  assert.match(htmlTextSequenceRuntime, /--hypit-text-path-transform/u);
  assert.match(htmlTextSequenceRuntime, /--hypit-text-sequence-transform/u);
  assert.doesNotMatch(htmlTextSequenceRuntime, /Caption|NLE|Timeline/u);
});
